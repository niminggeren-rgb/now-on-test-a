import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { LogicDiagramDataSchema, LogicDiagramRequestSchema } from '@/lib/ai/schemas/protocolSchemas';
import { getGeminiClient } from '@/lib/gemini/client';
import { generateLogicDiagram } from '@/lib/gemini/logic-diagram';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import type { ActionResult } from '@/types/action';
import type { LogicDiagramData } from '@/types/protocol';

export const runtime = 'nodejs';
export const maxDuration = 60;

const rateLimited = createRateLimiter(10);

/** 共有キャッシュは service role だけが読み書きする（一般ユーザーには RLS で開けない） */
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
  const parsed = LogicDiagramRequestSchema.safeParse(json);
  if (!parsed.success) return fail('本文の段落データが正しくありません', 400);
  const input = parsed.data;

  // 本文そのもののハッシュをキーにする（ID をキーにすると、偽の本文で別教材のキャッシュを汚せてしまう）
  const contentHash = createHash('sha256').update(JSON.stringify(input.paragraphs)).digest('hex');

  const supabase = cacheClient();
  if (supabase) {
    try {
      const { data } = await supabase.from('passage_logic_diagrams').select('diagram_json').eq('content_hash', contentHash).maybeSingle();
      const cached = LogicDiagramDataSchema.safeParse(data?.diagram_json);
      if (cached.success) {
        const body: ActionResult<LogicDiagramData> = { success: true, data: cached.data };
        return NextResponse.json(body);
      }
    } catch {
      // キャッシュ層の障害は生成にフォールバックする
    }
  }

  const ai = getGeminiClient();
  if (!ai) return fail('AI解析が利用できません（GEMINI_API_KEY が未設定です）。', 503);

  const diagram = await generateLogicDiagram(ai, input);
  if (!diagram) return fail('論理マップを生成できませんでした。もう一度お試しください。', 502);

  if (supabase) {
    try {
      await supabase.from('passage_logic_diagrams').upsert({ content_hash: contentHash, diagram_json: diagram }, { onConflict: 'content_hash' });
    } catch {
      // 保存に失敗しても、生成済みの結果は返す
    }
  }
  const body: ActionResult<LogicDiagramData> = { success: true, data: diagram };
  return NextResponse.json(body);
}
