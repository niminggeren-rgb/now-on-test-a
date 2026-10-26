import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { detectImageType } from '@/lib/exam-analysis';
import { getGeminiClient } from '@/lib/gemini/client';
import { importMaterialWithGemini, type ImportImagePart } from '@/lib/gemini/import-material';
import {
  estimateBase64Bytes,
  MAX_IMPORT_IMAGE_BYTES,
  MAX_IMPORT_IMAGES,
  stripDataUrlPrefix,
} from '@/lib/import-material';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import type { ActionResult } from '@/types/action';
import type { ImportedMaterial } from '@/types/ai-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = Math.ceil((MAX_IMPORT_IMAGES * MAX_IMPORT_IMAGE_BYTES * 4) / 3) + 512 * 1024;
const rateLimited = createRateLimiter(5);

const requestSchema = z.object({
  images: z
    .array(z.object({ mimeType: z.string().max(100), base64Data: z.string().min(1) }))
    .min(1)
    .max(MAX_IMPORT_IMAGES),
  modelPreference: z.enum(['fast', 'pro']).default('fast'),
});

function fail(error: string, status: number) {
  const body: ActionResult<never> = { success: false, error };
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  if (rateLimited(clientKey(request.headers))) {
    return fail('リクエストが多すぎます。しばらく待ってから再度お試しください。', 429);
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return fail('画像が大きすぎます（1枚4MBまで、最大6枚）', 413);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail('リクエストの形式が正しくありません', 400);
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return fail('教材の画像データが指定されていません（1〜6枚）', 400);

  const images: ImportImagePart[] = [];
  for (const img of parsed.data.images) {
    const base64 = stripDataUrlPrefix(img.base64Data);
    if (estimateBase64Bytes(base64) > MAX_IMPORT_IMAGE_BYTES) {
      return fail('画像が大きすぎます（1枚4MBまで）', 413);
    }
    // 申告された mimeType ではなく先頭バイトで形式を判定する
    const type = detectImageType(new Uint8Array(Buffer.from(base64, 'base64').subarray(0, 16)));
    if (!type) return fail('PNG または JPG の画像のみ取り込めます', 400);
    images.push({ mimeType: type, data: base64 });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return fail('AI解析が利用できません（GEMINI_API_KEY が未設定です）。', 503);
  }

  const material = await importMaterialWithGemini(ai, images, parsed.data.modelPreference);
  if (!material) {
    return fail('教材を読み取れませんでした。ピントと明るさを確認し、もう一度撮影してください。', 502);
  }
  const body: ActionResult<ImportedMaterial> = { success: true, data: material };
  return NextResponse.json(body);
}
