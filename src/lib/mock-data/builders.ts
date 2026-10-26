import type { ChoiceClause, ChoiceItem, PassageParagraph, TrapType } from '@/types/domain';

export const valid = (text: string, comment: string): ChoiceClause => ({ text, status: 'VALID', comment });
export const flawed = (text: string, comment: string): ChoiceClause => ({ text, status: 'FLAWED', comment });
export const neutral = (text: string, comment: string): ChoiceClause => ({ text, status: 'NEUTRAL', comment });

/**
 * 選択肢を節（clause）の連結から生成する。content と clauseBreakdown が常に一致する。
 * flawSegmentText は content の部分文字列でなければならない（scripts/validate-mock-data で検証）。
 */
export function buildChoice(
  questionId: string,
  choiceLabel: number,
  clauses: ChoiceClause[],
  primaryTrapType: TrapType,
  flawSegmentText: string | null,
  trapExplanation: string,
): ChoiceItem {
  return {
    id: `${questionId}-c${choiceLabel}`,
    questionId,
    choiceLabel,
    content: clauses.map((c) => c.text).join(''),
    isCorrect: primaryTrapType === 'NONE',
    primaryTrapType,
    flawSegmentText,
    clauseBreakdown: clauses,
    trapExplanation,
  };
}

/** 空白・改行を除いた文字数。 */
export function countChars(paragraphs: readonly PassageParagraph[]): number {
  return paragraphs.reduce((sum, p) => sum + p.text.replace(/\s/g, '').length, 0);
}
