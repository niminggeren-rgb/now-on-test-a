import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { OnDemandExplanationResponseSchema, OnDemandRequestSchema, type OnDemandExplanationResponse } from '@/lib/ai/schemas/phase8Schemas';
import { getGeminiClient } from '@/lib/gemini/client';
import { generateOnDemandExplanation } from '@/lib/gemini/phase8';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import type { ActionResult } from '@/types/action';

export const runtime = 'nodejs';
export const maxDuration = 60;

const rateLimited = createRateLimiter(10);

/** 共有キャッシュは service role だけが読み書きする（RLS で一般ユーザーには開けない＝キャッシュ汚染を防ぐ） */
function cacheClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key.startsWith('your-')) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function fail(error: string, status: number) {
  const body: ActionResult<never> = { success: false, error };
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  if (rateLimited(clientKey(request.headers))) return fail('リクエストが多すぎます。しばらく待ってから再度お試しください。', 429);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail('リクエストの形式が正しくありません', 400);
  }
  const parsed = OnDemandRequestSchema.safeParse(json);
  if (!parsed.success) return fail('本文・モード・選択肢の指定が正しくありません', 400);
  const input = parsed.data;

  // 入力全体のハッシュ。同じ設問は必ず同じキーになり、違う設問が衝突しない
  const cacheKey = createHash('sha256')
    .update(JSON.stringify([input.mode, input.passageText, input.questionPrompt, input.choices]))
    .digest('hex');

  const supabase = cacheClient();
  if (supabase) {
    try {
      const { data } = await supabase.from('explanation_caches').select('payload').eq('cache_key', cacheKey).maybeSingle();
      const cached = OnDemandExplanationResponseSchema.safeParse(data?.payload);
      if (cached.success) {
        const body: ActionResult<{ explanation: OnDemandExplanationResponse; fromCache: 'supabase' }> = {
          success: true,
          data: { explanation: cached.data, fromCache: 'supabase' },
        };
        return NextResponse.json(body);
      }
    } catch {
      // キャッシュ層の障害は生成にフォールバックする
    }
  }

  const ai = getGeminiClient();
  const { getNvidiaClient } = await import('@/lib/nvidia/client');
  const nvidiaClient = getNvidiaClient();
  if (!ai && !nvidiaClient) return fail('AI解説が利用できません（GEMINI_API_KEY または NVIDIA_API_KEY を設定してください）。', 503);

  let explanation: Awaited<ReturnType<typeof generateOnDemandExplanation>> | null = null;
  if (ai) {
    explanation = await generateOnDemandExplanation(ai, input);
    if (explanation) {
      if (supabase) {
        try {
          await supabase.from('explanation_caches').upsert({ cache_key: cacheKey, mode: input.mode, payload: explanation }, { onConflict: 'cache_key' });
        } catch {}
      }
      const body: ActionResult<{ explanation: OnDemandExplanationResponse; fromCache: 'none' }> = {
        success: true,
        data: { explanation, fromCache: 'none' },
      };
      return NextResponse.json(body);
    }
    if (!nvidiaClient) return fail('解説を生成できませんでした。もう一度お試しください。', 502);
  }
  if (nvidiaClient) {
    const { generateOnDemandExplanationWithNvidia } = await import('@/lib/nvidia/phase8');
    explanation = await generateOnDemandExplanationWithNvidia(nvidiaClient, input);
  }
  if (!explanation) return fail('解説を生成できませんでした。もう一度お試しください。', 502);

  if (supabase) {
    try {
      await supabase.from('explanation_caches').upsert({ cache_key: cacheKey, mode: input.mode, payload: explanation }, { onConflict: 'cache_key' });
    } catch {
      // 保存に失敗しても、生成済みの解説は返す
    }
  }
  const body: ActionResult<{ explanation: OnDemandExplanationResponse; fromCache: 'none' }> = {
    success: true,
    data: { explanation, fromCache: 'none' },
  };
  return NextResponse.json(body);
}
