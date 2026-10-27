import {
  OnDemandExplanationResponseSchema,
  type ExplanationChoice,
  type OnDemandExplanationResponse,
  type OnDemandMode,
} from '@/lib/ai/schemas/phase8Schemas';
import type { ActionResult } from '@/types/action';

const LOCAL_PREFIX = 'lv_explanation_cache_v1_';

export type ExplanationSource = 'localStorage' | 'supabase' | 'gemini-api';

export interface ExplanationRequest {
  mode: OnDemandMode;
  passageText: string;
  questionPrompt?: string;
  choices?: readonly ExplanationChoice[];
}

async function sha256Hex(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // 非セキュアコンテキスト用の簡易ハッシュ（キャッシュキーとしてのみ使用）
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return `fnv-${(h >>> 0).toString(16)}-${value.length}`;
}

/**
 * 解説の取得。localStorage → /api（Supabase 共有キャッシュ → Gemini）の順に解決する。
 * 同じ設問・モードは、同じ端末なら2回目以降ネットワークにも出ない。
 */
export async function fetchOnDemandExplanationWithCache(
  req: ExplanationRequest,
): Promise<{ data: OnDemandExplanationResponse; source: ExplanationSource }> {
  const payload = {
    mode: req.mode,
    passageText: req.passageText,
    questionPrompt: req.questionPrompt ?? '',
    choices: req.choices ?? [],
  };
  const localKey = LOCAL_PREFIX + (await sha256Hex(JSON.stringify([payload.mode, payload.passageText, payload.questionPrompt, payload.choices])));

  try {
    const raw = window.localStorage.getItem(localKey);
    if (raw) {
      const cached = OnDemandExplanationResponseSchema.safeParse(JSON.parse(raw));
      if (cached.success && cached.data.mode === req.mode) return { data: cached.data, source: 'localStorage' };
    }
  } catch {
    // 読めなければ API へ
  }

  const res = await fetch('/api/ai/on-demand-explanation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => null)) as
    | ActionResult<{ explanation: unknown; fromCache: 'supabase' | 'none' }>
    | null;
  if (!json || !json.success) throw new Error(json && !json.success ? json.error : '解説の取得に失敗しました。');

  const explanation = OnDemandExplanationResponseSchema.parse(json.data.explanation);
  try {
    window.localStorage.setItem(localKey, JSON.stringify(explanation));
  } catch {
    // 容量超過・保存不可でも表示は続ける
  }
  return { data: explanation, source: json.data.fromCache === 'supabase' ? 'supabase' : 'gemini-api' };
}
