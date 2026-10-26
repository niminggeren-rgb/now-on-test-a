import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  gradeDescriptiveLocally,
  normalizeGeminiEvaluation,
  type DescriptiveEvaluation,
} from '@/lib/descriptive-grading';
import { getGeminiClient } from '@/lib/gemini/client';
import { evaluateWithGemini } from '@/lib/gemini/evaluate-descriptive';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import { createRepository } from '@/lib/repository';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types/action';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ANSWER_CHARS = 1500;

const bodySchema = z.object({
  passageId: z.string().min(1).max(200),
  questionId: z.string().min(1).max(200),
  answer: z.string().max(MAX_ANSWER_CHARS * 3),
});

const rateLimited = createRateLimiter(10);

function fail(error: string, status: number, fieldErrors?: Record<string, string[]>) {
  const body: ActionResult<never> = { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) };
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail('入力内容が正しくありません', 400, parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }
  const { passageId, questionId, answer } = parsed.data;
  if (answer.replace(/\s/g, '').length < 10) return fail('答案が短すぎます。もう少し書いてから添削してください。', 400);

  // 本文・設問・ルーブリックはクライアントからではなくサーバー側のデータから取得する
  const repo = createRepository(await createClient(), null);
  const passage = await repo.getPassage(passageId);
  const question = passage?.questions.find((q) => q.id === questionId);
  if (!passage || !question || question.questionType !== 'DESCRIPTIVE_400' || !question.gradingRubric?.length) {
    return fail('記述問題が見つかりません', 404);
  }

  const ai = getGeminiClient();
  let evaluation: DescriptiveEvaluation;
  if (!ai) {
    evaluation = gradeDescriptiveLocally(question, answer, 'AI採点が未設定のため、ローカル採点エンジンで採点しました。');
  } else {
    const raw = await evaluateWithGemini(ai, passage, question, answer);
    evaluation = raw
      ? normalizeGeminiEvaluation(question, answer, raw)
      : gradeDescriptiveLocally(question, answer, 'AI採点に失敗したため、ローカル採点エンジンで採点しました。');
  }

  const body: ActionResult<DescriptiveEvaluation> = {
    success: true,
    data: { ...evaluation, modelAnswerText: question.modelAnswerText },
  };
  return NextResponse.json(body);
}
