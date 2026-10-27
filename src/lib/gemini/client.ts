import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = 'gemini-3.8-flash';

/** 使用モデル。クォータ(429)対策で Pro は使わず、環境変数 GEMINI_MODEL があればそれを、無ければ軽量の Flash を使う。 */
function modelName(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export const GEMINI_MODELS = {
  get fast(): string {
    return modelName();
  },
  get pro(): string {
    return modelName();
  },
};

/** 受け付ける環境変数名（先頭が優先）。Vercel などの設定画面で別名を使っても動くようにする。 */
export const GEMINI_KEY_ENV_NAMES = ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_API_KEY'] as const;

/** 設定画面からのコピペで紛れ込みやすい前後の空白・改行・引用符を除く */
function cleanKey(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
}

/** 有効なキーとその変数名。未設定、またはサンプルの値（your-…）のままなら null。 */
export function resolveGeminiKey(env: Record<string, string | undefined> = process.env): { apiKey: string; source: string } | null {
  for (const name of GEMINI_KEY_ENV_NAMES) {
    const apiKey = cleanKey(env[name]);
    if (apiKey && !apiKey.startsWith('your-')) return { apiKey, source: name };
  }
  return null;
}

/**
 * サーバー専用。キーが未設定の場合は null を返し、
 * 呼び出し側はローカル採点/シミュレーションにフォールバックする。
 */
export function getGeminiClient(): GoogleGenAI | null {
  const key = resolveGeminiKey();
  return key ? new GoogleGenAI({ apiKey: key.apiKey }) : null;
}

/** Gemini SDK のエラーを、画面とログに出せる短い説明にする（API キーらしき文字列は伏せる） */
export function describeGeminiError(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status;
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.replace(/AIza[0-9A-Za-z_-]{20,}/g, '***').slice(0, 300);
  return `Gemini呼び出しエラー${typeof status === 'number' ? ` (HTTP ${status})` : ''}: ${message}`;
}
