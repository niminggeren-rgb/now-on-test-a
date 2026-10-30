import type OpenAI from 'openai';
import { parseExamDiagnosisJson } from '@/lib/exam-diagnosis';
import type { ExamAnalysisResult } from '@/types/ai-pipeline';
import { EXAM_SYSTEM_PROMPT, type ExamImagePart } from '@/lib/gemini/analyze-exam';
import { describeNvidiaError } from './client';
import { callNvidiaJsonWithImages } from './helpers';

export type ExamAnalysisOutcome =
  | { ok: true; data: ExamAnalysisResult }
  | { ok: false; reason: 'timeout' | 'busy' | 'invalid'; detail?: string };

/** Nvidia Visionで問題用紙＋答案の2枚を照合診断する */
export async function analyzeExamWithNvidia(
  client: OpenAI,
  problem: ExamImagePart,
  answer: ExamImagePart,
): Promise<ExamAnalysisOutcome> {
  try {
    const text = await callNvidiaJsonWithImages(
      client,
      EXAM_SYSTEM_PROMPT,
      '上記2枚の画像を照合し、設問ごとの正誤・誤答トラップ診断・記述要素採点・弱点スコア変動・講師カルテ用アドバイス・弱点克服ミニ特訓問題をJSONで出力してください。出力はJSONのみ。',
      [
        { mimeType: problem.mimeType, data: problem.data },
        { mimeType: answer.mimeType, data: answer.data },
      ],
      { temperature: 0.2, max_tokens: 6144, timeoutMs: 100_000 },
    );
    if (!text) {
      return { ok: false, reason: 'invalid', detail: 'Nvidiaからの応答を読み取れませんでした' };
    }
    // 最初に問題/答案ラベルを補足するため、2画像を区別するテキストを先頭に付けて再送した方が精度が上がるが、今回はhelpers内で画像2枚をそのまま渡す
    // callNvidiaJsonWithImagesは画像の順序を保持するので、system prompt内の指示と合わせて1枚目=問題、2枚目=答案として解釈される
    const parsed = parseExamDiagnosisJson(text);
    if (!parsed) {
      return { ok: false, reason: 'invalid', detail: 'Nvidiaの出力をJSONとして解析できませんでした' };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    console.error('[nvidia/analyze-exam] error:', e);
    return { ok: false, reason: 'invalid', detail: describeNvidiaError(e) };
  }
}
