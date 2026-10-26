import { ExamAnalysisSchema, type ExamAnalysisResult, type TrapType } from '@/types/ai-pipeline';

export const WEAKNESS_TRAPS = [
  'overstatement',
  'causal_inversion',
  'substitution',
  'unmentioned',
  'subject_object_reversal',
] as const satisfies readonly Exclude<TrapType, 'none'>[];

export type WeaknessTrap = (typeof WEAKNESS_TRAPS)[number];

/** 1回の診断で加算できる弱点スコアの上限（AIの暴走値でレーダーが張り付くのを防ぐ） */
export const MAX_DELTA = 25;

export function clampDelta(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_DELTA, Math.max(0, value)) : 0;
}

/**
 * Gemini の診断 JSON を検証する。コードフェンスは許容。
 * 特訓問題は「正解がちょうど1つ」でなければ解答UIが成立しないため、満たさなければ null を返す。
 */
export function parseExamDiagnosisJson(textOut: string | undefined): ExamAnalysisResult | null {
  if (!textOut) return null;
  const cleaned = textOut.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = ExamAnalysisSchema.safeParse(JSON.parse(cleaned));
    if (!parsed.success) return null;
    const correct = parsed.data.remedialQuestion.choices.filter((c) => c.isCorrect).length;
    return correct === 1 ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface DiagnosisSummary {
  correctCount: number;
  total: number;
  /** 引っかかったトラップの回数（多い順） */
  trapCounts: { trap: WeaknessTrap; count: number }[];
}

export function summarizeDiagnostics(result: ExamAnalysisResult): DiagnosisSummary {
  const counts = new Map<WeaknessTrap, number>();
  for (const d of result.questionDiagnostics) {
    if (d.isCorrect || d.detectedTrap === 'none') continue;
    counts.set(d.detectedTrap, (counts.get(d.detectedTrap) ?? 0) + 1);
  }
  return {
    correctCount: result.questionDiagnostics.filter((d) => d.isCorrect).length,
    total: result.questionDiagnostics.length,
    trapCounts: [...counts.entries()].map(([trap, count]) => ({ trap, count })).sort((a, b) => b.count - a.count),
  };
}
