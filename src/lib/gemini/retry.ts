import { describeGeminiError } from '@/lib/gemini/client';

/** 使えるモデルの候補（先頭ほど優先）。GEMINI_MODEL があればそれを最優先し、軽量の Flash 系へ順にフォールバックする。 */
export function geminiModelCandidates(env: Record<string, string | undefined> = process.env): string[] {
  const list = [env.GEMINI_MODEL?.trim(), 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  return [...new Set(list.filter((m): m is string => !!m))];
}

/** 2.5 系は思考を無効化して速くできる。それ以外のモデルには未対応の設定を送らない。 */
export function thinkingConfigFor(model: string): { thinkingConfig: { thinkingBudget: number } } | Record<string, never> {
  return model.startsWith('gemini-2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {};
}

function statusOf(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

/** 待てば通る可能性がある失敗か（混雑・上限・一時的な障害・通信断） */
export function isTransientGeminiError(err: unknown): boolean {
  const status = statusOf(err);
  return status === null || status === 408 || status === 429 || status >= 500;
}

export interface RetryOptions {
  /** 全体の制限（ミリ秒）。関数の maxDuration より短くする */
  deadlineMs?: number;
  /** 1回の呼び出しの制限 */
  attemptTimeoutMs?: number;
  maxAttempts?: number;
  /** テスト用: 待機を差し替える */
  sleep?: (ms: number) => Promise<void>;
}

export type RetryOutcome<T> =
  | { ok: true; value: T; model: string; attempts: number }
  | { ok: false; reason: 'timeout' | 'busy' | 'invalid'; detail: string; attempts: number };

/**
 * Gemini 呼び出しを、混雑(429/5xx)・タイムアウト・不正な出力のたびに待って再試行する。
 * 失敗のたびに次のモデル候補へ回し、モデルが存在しない(404)ものは候補から外す。
 * 認証エラーなど再試行しても直らない失敗(400/401/403)は、すぐ例外として呼び出し元へ返す。
 * `attempt` は結果を返す。出力が使えない（JSON 不正など）ときは null を返すと再試行される。
 */
export async function withGeminiRetry<T>(
  attempt: (signal: AbortSignal, model: string) => Promise<T | null>,
  options: RetryOptions = {},
): Promise<RetryOutcome<T>> {
  const { deadlineMs = 240_000, attemptTimeoutMs = 100_000, maxAttempts = 6 } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const models = geminiModelCandidates();
  const started = Date.now();
  let reason: 'timeout' | 'busy' | 'invalid' = 'busy';
  let detail = '';
  let attempts = 0;

  for (let i = 0; i < maxAttempts && models.length > 0; i++) {
    const remaining = deadlineMs - (Date.now() - started);
    if (remaining < 5_000) break;

    const model = models[i % models.length]!;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(attemptTimeoutMs, remaining));
    attempts++;
    try {
      const value = await attempt(controller.signal, model);
      if (value !== null) return { ok: true, value, model, attempts };
      reason = 'invalid';
      detail = `${model}: 出力を読み取れませんでした`;
    } catch (err) {
      if (controller.signal.aborted) {
        reason = 'timeout';
        detail = `${model}: 応答がタイムアウトしました`;
      } else if (statusOf(err) === 404) {
        // このモデルは使えない。候補から外して次へ
        models.splice(models.indexOf(model), 1);
        detail = describeGeminiError(err);
        reason = 'busy';
        i--; // 失敗に数えない（待たずに次のモデルを試す）
        continue;
      } else if (isTransientGeminiError(err)) {
        reason = 'busy';
        detail = describeGeminiError(err);
      } else {
        throw err; // 再試行しても直らない（キー無効・権限・不正な指定）
      }
    } finally {
      clearTimeout(timer);
    }

    const backoff = Math.min(2_000 * 2 ** i, 15_000) + Math.floor(Math.random() * 500);
    if (deadlineMs - (Date.now() - started) <= backoff + 5_000) break;
    await sleep(backoff);
  }
  return { ok: false, reason, detail: detail || '利用できるモデルがありません', attempts };
}
