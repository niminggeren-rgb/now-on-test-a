import {
  type ActiveTrapType,
  type ChoiceEliminationState,
  type EliminationTraceEntry,
  type QuestionItem,
  type TrapWeaknessStat,
} from '@/types/domain';

export const ACTIVE_TRAP_TYPES: readonly ActiveTrapType[] = [
  'OVERSTATEMENT',
  'CAUSAL_REVERSAL',
  'CONCEPT_SWAP',
  'UNMENTIONED',
  'SUBJECT_OBJECT_FLIP',
  'PARTIAL_CONTRADICTION',
];

/**
 * 弱点スコア (0-100)。supabase/schema.sql の recalculate_trap_weakness() と同一の式。
 *   引っかかり率 × 75 + 見破れなかった率 × 25
 */
export function computeWeaknessScore(encountered: number, trapped: number, correctlyTagged: number): number {
  if (encountered <= 0) return 0;
  const score = (trapped / encountered) * 75 + (1 - correctlyTagged / encountered) * 25;
  return Math.round(Math.min(100, Math.max(0, score)) * 100) / 100;
}

export function emptyTrapStats(): TrapWeaknessStat[] {
  return ACTIVE_TRAP_TYPES.map((trapType) => ({
    trapType,
    encounteredCount: 0,
    trappedCount: 0,
    correctlyTaggedCount: 0,
    weaknessScore: 0,
  }));
}

/** 生徒の消去操作（選択肢番号 → 状態）から、正解トラップとの照合を含む消去トレースを作る。 */
export function buildEliminationTrace(
  question: QuestionItem,
  elimination: Record<string, ChoiceEliminationState>,
): Record<string, EliminationTraceEntry> {
  const trace: Record<string, EliminationTraceEntry> = {};
  for (const choice of question.choices) {
    const state = elimination[String(choice.choiceLabel)];
    if (!state) continue;
    trace[String(choice.choiceLabel)] = {
      eliminated: state.eliminated,
      userTaggedTrap: state.userTaggedTrap,
      slashedSegment: state.slashedSegment,
      actualTrap: choice.primaryTrapType,
      isTrapMatch: choice.primaryTrapType !== 'NONE' && state.userTaggedTrap === choice.primaryTrapType,
    };
  }
  return trace;
}

/**
 * 1回の回答をトラップ別統計へ反映する（DB トリガーと同じ規則）。
 * 当該設問の「トラップ付き誤答選択肢」ごとに、遭遇+1 / 最終解答として選んだか / トラップ種別を言い当てたか を加算する。
 */
export function applyAnswerToStats(
  stats: readonly TrapWeaknessStat[],
  question: QuestionItem,
  selectedChoiceLabel: number | null,
  trace: Record<string, EliminationTraceEntry>,
): TrapWeaknessStat[] {
  if (selectedChoiceLabel === null) return stats.map((s) => ({ ...s }));

  const next = new Map<ActiveTrapType, TrapWeaknessStat>(stats.map((s) => [s.trapType, { ...s }]));
  for (const choice of question.choices) {
    if (choice.isCorrect || choice.primaryTrapType === 'NONE') continue;
    const current = next.get(choice.primaryTrapType) ?? {
      trapType: choice.primaryTrapType,
      encounteredCount: 0,
      trappedCount: 0,
      correctlyTaggedCount: 0,
      weaknessScore: 0,
    };
    const trapped = selectedChoiceLabel === choice.choiceLabel ? 1 : 0;
    const tagged = trace[String(choice.choiceLabel)]?.userTaggedTrap === choice.primaryTrapType ? 1 : 0;
    const encounteredCount = current.encounteredCount + 1;
    const trappedCount = current.trappedCount + trapped;
    const correctlyTaggedCount = current.correctlyTaggedCount + tagged;
    next.set(choice.primaryTrapType, {
      trapType: choice.primaryTrapType,
      encounteredCount,
      trappedCount,
      correctlyTaggedCount,
      weaknessScore: computeWeaknessScore(encounteredCount, trappedCount, correctlyTaggedCount),
    });
  }
  return ACTIVE_TRAP_TYPES.map((t) => next.get(t)).filter((s): s is TrapWeaknessStat => s !== undefined);
}
