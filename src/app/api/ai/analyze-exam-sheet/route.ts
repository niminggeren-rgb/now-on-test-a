import { NextResponse, type NextRequest } from 'next/server';
import {
  detectImageType,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  simulateExamAnalysis,
  type ExamAnalysis,
} from '@/lib/exam-analysis';
import { getGeminiClient } from '@/lib/gemini/client';
import { analyzeWithGemini, type ImagePart } from '@/lib/gemini/analyze-exam-sheet';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import { activeTrapTypeSchema } from '@/lib/schemas';
import type { ActionResult } from '@/types/action';
import type { ActiveTrapType } from '@/types/domain';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_BYTES + 512 * 1024;
const rateLimited = createRateLimiter(5);

function fail(error: string, status: number) {
  const body: ActionResult<never> = { success: false, error };
  return NextResponse.json(body, { status });
}

function parseWeakTraps(raw: FormDataEntryValue | null): ActiveTrapType[] {
  if (typeof raw !== 'string') return [];
  const out: ActiveTrapType[] = [];
  for (const part of raw.split(',').slice(0, 6)) {
    const parsed = activeTrapTypeSchema.safeParse(part.trim());
    if (parsed.success && !out.includes(parsed.data)) out.push(parsed.data);
  }
  return out.slice(0, 3);
}

export async function POST(request: NextRequest) {
  if (rateLimited(clientKey(request.headers))) {
    return fail('リクエストが多すぎます。しばらく待ってから再度お試しください。', 429);
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return fail('画像が大きすぎます（1枚4MBまで、最大3枚）', 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('リクエストの形式が正しくありません', 400);
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return fail('画像ファイルを選択してください', 400);
  if (files.length > MAX_IMAGES) return fail(`画像は最大${MAX_IMAGES}枚までです`, 400);

  const images: ImagePart[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) return fail('画像が大きすぎます（1枚4MBまで）', 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) return fail('PNG または JPG の画像のみアップロードできます', 400);
    images.push({ mimeType: type, data: Buffer.from(bytes).toString('base64') });
  }

  const weakTraps = parseWeakTraps(form.get('weakTraps'));
  const ai = getGeminiClient();

  let analysis: ExamAnalysis;
  if (!ai) {
    analysis = simulateExamAnalysis(weakTraps);
  } else {
    const raw = await analyzeWithGemini(ai, images, weakTraps);
    analysis = raw
      ? { ...raw, source: 'gemini' }
      : {
          ...simulateExamAnalysis(weakTraps),
          notice: 'AI解析に失敗したため、画像の内容は解析していません。表示は、あなたの弱点データに基づくシミュレーションです。',
        };
  }

  const body: ActionResult<ExamAnalysis> = { success: true, data: analysis };
  return NextResponse.json(body);
}
