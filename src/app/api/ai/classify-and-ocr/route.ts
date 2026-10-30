import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { detectImageType } from '@/lib/exam-analysis';
import { getGeminiClient } from '@/lib/gemini/client';
import { extractInkSeparated, triageImages, type Phase8Image } from '@/lib/gemini/phase8';
import { estimateBase64Bytes, MAX_IMPORT_IMAGE_BYTES, MAX_IMPORT_IMAGES, stripDataUrlPrefix } from '@/lib/import-material';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import type { ActionResult } from '@/types/action';
import type { Stage1TriageResponse, Stage2InkSeparatedResponse } from '@/lib/ai/schemas/phase8Schemas';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_BODY_BYTES = Math.ceil((MAX_IMPORT_IMAGES * MAX_IMPORT_IMAGE_BYTES * 4) / 3) + 512 * 1024;
const rateLimited = createRateLimiter(5);

const requestSchema = z.object({
  images: z
    .array(z.object({ id: z.string().max(100), base64Data: z.string().min(1) }))
    .min(1)
    .max(MAX_IMPORT_IMAGES),
});

export interface ClassifyAndOcrResult {
  pipelineStats: {
    totalUploadedImages: number;
    stage2RetainedVisualImages: number;
    stage2DiscardedImages: number;
    /** Stage 2 に画像として渡さなかった割合（%） */
    estimatedVisionTokenSavingPercent: number;
  };
  triage: Stage1TriageResponse['items'];
  analysis: Stage2InkSeparatedResponse;
}

function fail(error: string, status: number) {
  const body: ActionResult<never> = { success: false, error };
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  if (rateLimited(clientKey(request.headers))) return fail('リクエストが多すぎます。しばらく待ってから再度お試しください。', 429);
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY_BYTES) return fail('画像が大きすぎます（1枚4MBまで、最大6枚）', 413);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail('リクエストの形式が正しくありません', 400);
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return fail('解析する画像が指定されていません（1〜6枚）', 400);

  const images: Phase8Image[] = [];
  for (const [i, img] of parsed.data.images.entries()) {
    const base64 = stripDataUrlPrefix(img.base64Data);
    if (estimateBase64Bytes(base64) > MAX_IMPORT_IMAGE_BYTES) return fail('画像が大きすぎます（1枚4MBまで）', 413);
    // 申告された mimeType ではなく先頭バイトで形式を判定する
    const type = detectImageType(new Uint8Array(Buffer.from(base64, 'base64').subarray(0, 16)));
    if (!type) return fail('PNG・JPEG・WebP の画像のみ解析できます', 400);
    images.push({ id: img.id || `img-${i}`, mimeType: type, data: base64 });
  }

  const ai = getGeminiClient();
  const { getNvidiaClient } = await import('@/lib/nvidia/client');
  const nvidiaClient = getNvidiaClient();
  if (!ai && !nvidiaClient) return fail('AI解析が利用できません（GEMINI_API_KEY または NVIDIA_API_KEY を設定してください）。', 503);

  let triage: Awaited<ReturnType<typeof triageImages>> | null = null;
  let analysis: Awaited<ReturnType<typeof extractInkSeparated>> | null = null;

  if (ai) {
    triage = await triageImages(ai, images);
    if (triage) {
      const byIndex = new Map(triage.items.map((t) => [t.imageIndex, t]));
      const retained: Phase8Image[] = [];
      images.forEach((img, i) => {
        const t = byIndex.get(i);
        if (!t || t.requiresVisualInspection || t.category === 'STUDENT_SHEET' || t.hasHandwriting) retained.push(img);
      });
      const digest = triage.items.map((t) => `[ImageIndex:${t.imageIndex} / Category:${t.category}]\n${t.extractedRawText}`).join('\n\n====================\n\n');
      analysis = await extractInkSeparated(ai, digest, retained);
      if (analysis) {
        const discarded = images.length - retained.length;
        const body: ActionResult<ClassifyAndOcrResult> = {
          success: true,
          data: {
            pipelineStats: {
              totalUploadedImages: images.length,
              stage2RetainedVisualImages: retained.length,
              stage2DiscardedImages: discarded,
              estimatedVisionTokenSavingPercent: Math.round((discarded / images.length) * 100),
            },
            triage: triage.items,
            analysis,
          },
        };
        return NextResponse.json(body);
      }
    }
    if (!nvidiaClient) {
      if (!triage) return fail('画像の仕分けに失敗しました。もう一度お試しください。', 502);
      return fail('設問の構造化に失敗しました。写真の明るさとピントを確認してください。', 502);
    }
  }

  // Nvidiaフォールバック
  if (nvidiaClient) {
    const { triageImagesWithNvidia, extractInkSeparatedWithNvidia } = await import('@/lib/nvidia/phase8');
    const nvidiaTriage = await triageImagesWithNvidia(nvidiaClient, images as never);
    if (!nvidiaTriage) return fail('画像の仕分けに失敗しました。もう一度お試しください。', 502);
    const byIndex = new Map(nvidiaTriage.items.map((t) => [t.imageIndex, t]));
    const nvidiaRetained: Phase8Image[] = [];
    images.forEach((img, i) => {
      const t = byIndex.get(i);
      if (!t || t.requiresVisualInspection || t.category === 'STUDENT_SHEET' || t.hasHandwriting) nvidiaRetained.push(img as never);
    });
    const digest = nvidiaTriage.items.map((t) => `[ImageIndex:${t.imageIndex} / Category:${t.category}]\n${t.extractedRawText}`).join('\n\n====================\n\n');
    const nvidiaAnalysis = await extractInkSeparatedWithNvidia(nvidiaClient, digest, nvidiaRetained as never);
    if (!nvidiaAnalysis) return fail('設問の構造化に失敗しました。写真の明るさとピントを確認してください。', 502);
    const discarded = images.length - nvidiaRetained.length;
    const body: ActionResult<ClassifyAndOcrResult> = {
      success: true,
      data: {
        pipelineStats: {
          totalUploadedImages: images.length,
          stage2RetainedVisualImages: nvidiaRetained.length,
          stage2DiscardedImages: discarded,
          estimatedVisionTokenSavingPercent: Math.round((discarded / images.length) * 100),
        },
        triage: nvidiaTriage.items,
        analysis: nvidiaAnalysis,
      },
    };
    return NextResponse.json(body);
  }
  return fail('設問の構造化に失敗しました。', 502);
}
