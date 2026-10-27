import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { detectImageType } from '@/lib/exam-analysis';
import { analyzeExamWithGemini, type ExamImagePart } from '@/lib/gemini/analyze-exam';
import { getGeminiClient } from '@/lib/gemini/client';
import { estimateBase64Bytes, MAX_IMPORT_IMAGE_BYTES, stripDataUrlPrefix } from '@/lib/import-material';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import type { ActionResult } from '@/types/action';
import type { ExamAnalysisResult } from '@/types/ai-pipeline';

export const runtime = 'nodejs';
// Vercel の関数の実行上限。Gemini 側は 50秒で打ち切る（analyze-exam.ts）
export const maxDuration = 60;

const MAX_BODY_BYTES = Math.ceil((2 * MAX_IMPORT_IMAGE_BYTES * 4) / 3) + 512 * 1024;
const rateLimited = createRateLimiter(5);

const imageSchema = z.object({ mimeType: z.string().max(100), base64Data: z.string().min(1) });
const requestSchema = z.object({ problemImage: imageSchema, answerImage: imageSchema });

function fail(error: string, status: number) {
  const body: ActionResult<never> = { success: false, error };
  return NextResponse.json(body, { status });
}

function toPart(img: z.infer<typeof imageSchema>): ExamImagePart | 'too_large' | null {
  const base64 = stripDataUrlPrefix(img.base64Data);
  if (estimateBase64Bytes(base64) > MAX_IMPORT_IMAGE_BYTES) return 'too_large';
  // 申告された mimeType ではなく先頭バイトで形式を判定する
  const type = detectImageType(new Uint8Array(Buffer.from(base64, 'base64').subarray(0, 16)));
  return type ? { mimeType: type, data: base64 } : null;
}

export async function POST(request: NextRequest) {
  if (rateLimited(clientKey(request.headers))) {
    return fail('リクエストが多すぎます。しばらく待ってから再度お試しください。', 429);
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return fail('画像が大きすぎます（1枚4MBまで）', 413);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail('リクエストの形式が正しくありません', 400);
  }
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return fail('「問題用紙」と「生徒の答案」の2枚の画像をアップロードしてください。', 400);

  const problem = toPart(parsed.data.problemImage);
  const answer = toPart(parsed.data.answerImage);
  if (problem === 'too_large' || answer === 'too_large') return fail('画像が大きすぎます（1枚4MBまで）', 413);
  if (!problem || !answer) return fail('PNG・JPEG・WebP の画像のみ解析できます', 400);

  const ai = getGeminiClient();
  if (!ai) return fail('AI解析が利用できません（GEMINI_API_KEY が未設定です）。', 503);

  const outcome = await analyzeExamWithGemini(ai, problem, answer);
  if (!outcome.ok) {
    if (outcome.reason === 'timeout') return fail('処理がタイムアウトしました。もう一度お試しください。', 504);
    if (outcome.reason === 'busy') return fail('AIサービスが混み合っています。しばらく待ってから、もう一度お試しください。', 503);
    return fail('診断結果を読み取れませんでした。もう一度お試しください（改善しない場合は、撮り直してください）。', 502);
  }
  const result = outcome.data;
  const body: ActionResult<ExamAnalysisResult> = { success: true, data: result };
  return NextResponse.json(body);
}
