import type OpenAI from 'openai';
import {
  STAGE1_TRIAGE_SYSTEM_PROMPT,
  STAGE2_INK_SEPARATED_OCR_SYSTEM_PROMPT,
  ON_DEMAND_EXPLANATION_SYSTEM_PROMPT,
} from '@/lib/ai/prompts/phase8Prompts';
import {
  OnDemandExplanationResponseSchema,
  Stage1TriageResponseSchema,
  Stage2InkSeparatedResponseSchema,
  type Stage1TriageResponse,
  type Stage2InkSeparatedResponse,
  type OnDemandExplanationResponse,
  type ExplanationChoice,
  type OnDemandMode,
} from '@/lib/ai/schemas/phase8Schemas';
import { describeNvidiaError } from './client';
import { callNvidiaJson, callNvidiaJsonWithImages } from './helpers';

export interface Phase8Image {
  id: string;
  mimeType: string;
  data: string;
}

export async function triageImagesWithNvidia(
  client: OpenAI,
  images: readonly Phase8Image[],
): Promise<Stage1TriageResponse | null> {
  const parts: { mimeType: string; data: string }[] = images.map((i) => ({ mimeType: i.mimeType, data: i.data }));
  // テキスト部分と画像を交互に渡すため、専用の呼び出しを構築
  const system = STAGE1_TRIAGE_SYSTEM_PROMPT;
  const intro = `以下の ${images.length} 枚の画像を順に判定し、分類・図版精読要否・テキスト抽出を行ってください。`;
  // 画像をdata URIで直接渡すための手動構築
  try {
    const text = await callNvidiaJsonWithImages(
      client,
      system,
      `${intro}\n` + images.map((img, i) => `--- Image Index: ${i} (imageId: ${img.id}) ---`).join('\n'),
      parts as never,
      { temperature: 0.1, max_tokens: 8192 },
    );
    if (!text) return null;
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = Stage1TriageResponseSchema.safeParse(JSON.parse(cleaned));
    return parsed.success ? parsed.data : null;
  } catch (e) {
    console.error('[nvidia/phase8 triage] error:', describeNvidiaError(e));
    return null;
  }
}

export async function extractInkSeparatedWithNvidia(
  client: OpenAI,
  textDigest: string,
  retained: readonly Phase8Image[],
): Promise<Stage2InkSeparatedResponse | null> {
  const system = STAGE2_INK_SEPARATED_OCR_SYSTEM_PROMPT;
  const intro = `Stage 1 で全画像から抽出したテキスト:\n\n${textDigest}\n\n続けて、手書き筆跡または必須図版を含む ${retained.length} 枚の画像のみを添付します。鉛筆（自力消去）と赤/青ペン（丸付け・復習）を分離し、各設問の選択肢の傷を構造化してください。`;
  try {
    const text = await callNvidiaJsonWithImages(
      client,
      system,
      intro,
      retained.map((r) => ({ mimeType: r.mimeType, data: r.data })) as never,
      { temperature: 0.1, max_tokens: 8192 },
    );
    if (!text) return null;
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = Stage2InkSeparatedResponseSchema.safeParse(JSON.parse(cleaned));
    return parsed.success ? parsed.data : null;
  } catch (e) {
    console.error('[nvidia/phase8 extract] error:', describeNvidiaError(e));
    return null;
  }
}

export async function generateOnDemandExplanationWithNvidia(
  client: OpenAI,
  input: { mode: OnDemandMode; passageText: string; questionPrompt: string; choices: readonly ExplanationChoice[] },
): Promise<OnDemandExplanationResponse | null> {
  const textPrompt = `【要求モード】: ${input.mode}\n\n【問題本文】:\n${input.passageText}\n\n【対象設問】:\n${input.questionPrompt || '（本文全体の論理構造解析）'}\n\n【選択肢データ】:\n${JSON.stringify(input.choices)}`;
  try {
    const text = await callNvidiaJson(client, ON_DEMAND_EXPLANATION_SYSTEM_PROMPT, textPrompt, {
      temperature: 0.2,
      max_tokens: 6144,
    });
    if (!text) return null;
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = OnDemandExplanationResponseSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success || parsed.data.mode !== input.mode) return null;
    const d = parsed.data;
    if (input.mode === 'BINARY_OPPOSITION_MAP' ? !d.binaryOppositionMap : !d.thinkingProcess) return null;
    return d;
  } catch (e) {
    console.error('[nvidia/on-demand] error:', describeNvidiaError(e));
    return null;
  }
}
