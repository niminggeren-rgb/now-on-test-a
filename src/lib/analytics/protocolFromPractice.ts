import type { AnswerLog, QuestionItem } from '@/types/domain';
import { DOMAIN_TO_PROTOCOL_TRAP, type OptionTrapType } from '@/types/protocol';
import type { AttemptInput } from '@/lib/repositories/protocolRepository';

/**
 * 演習で解答を確定した結果を、プロトコル評価の入力に変換する。
 * Step 1〜3 は演習画面では直接計測していないので、選択肢のトラップ種別からの推定になる（protocolScoring 参照）。
 */
export function buildAttemptFromPractice(log: AnswerLog, question: QuestionItem): AttemptInput | null {
  if (log.selectedChoiceLabel === null || question.correctChoiceLabel === null) return null;

  const traps = (c: QuestionItem['choices'][number]): OptionTrapType | null =>
    c.isCorrect || c.primaryTrapType === 'NONE' ? null : DOMAIN_TO_PROTOCOL_TRAP[c.primaryTrapType];

  const allChoicesTraps = question.choices.flatMap((c) => {
    const t = traps(c);
    return t ? [t] : [];
  });
  const selected = question.choices.find((c) => c.choiceLabel === log.selectedChoiceLabel);
  const selectedTrap = selected ? traps(selected) : null;

  // 節分割（スラッシュ）まで入れて消去した選択肢の割合
  const eliminated = Object.values(log.eliminationTrace).filter((t) => t.eliminated);
  const slashed = eliminated.filter((t) => t.slashedSegment).length;

  return {
    passageId: log.passageId,
    questionId: log.questionId,
    selectedChoiceId: String(log.selectedChoiceLabel),
    correctChoiceId: String(question.correctChoiceLabel),
    isCorrect: log.isCorrect,
    selectedChoiceTrap: !log.isCorrect && selectedTrap ? selectedTrap : undefined,
    allChoicesTraps,
    slashSegmentationQuality: eliminated.length === 0 ? 0 : slashed / eliminated.length,
  };
}
