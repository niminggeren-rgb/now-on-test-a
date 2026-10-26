import type { PassageItem, QuestionItem } from '@/types/domain';
import { aestheticsPassage } from './passage-aesthetics';
import { linguisticsPassage } from './passage-linguistics';
import { sciencePassage } from './passage-science';

/** オフライン/デモフォールバック用の完全データセット（Supabase 未接続時に使用）。 */
export const MOCK_PASSAGES: readonly PassageItem[] = [aestheticsPassage, linguisticsPassage, sciencePassage];

export function findMockPassage(passageId: string): PassageItem | undefined {
  return MOCK_PASSAGES.find((p) => p.id === passageId);
}

export function findMockQuestion(questionId: string): { passage: PassageItem; question: QuestionItem } | undefined {
  for (const passage of MOCK_PASSAGES) {
    const question = passage.questions.find((q) => q.id === questionId);
    if (question) return { passage, question };
  }
  return undefined;
}
