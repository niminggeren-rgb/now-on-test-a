import { ACTIVE_TRAP_TYPES } from '@/lib/scoring';
import type { ActiveTrapType, PassageItem, PassageTheme, TargetTier } from '@/types/domain';

/** 一覧画面に渡す軽量な文章サマリ（本文・選択肢は含めない）。 */
export interface PassageSummary {
  id: string;
  title: string;
  author: string;
  theme: PassageTheme;
  difficultyLevel: number;
  targetTier: TargetTier;
  charCount: number;
  standardTimeSeconds: number;
  choiceQuestionCount: number;
  descriptiveQuestionCount: number;
}

export type TrapIndex = Record<ActiveTrapType, string[]>;

export function summarizePassage(p: PassageItem): PassageSummary {
  return {
    id: p.id,
    title: p.title,
    author: p.author,
    theme: p.theme,
    difficultyLevel: p.difficultyLevel,
    targetTier: p.targetTier,
    charCount: p.charCount,
    standardTimeSeconds: p.standardTimeSeconds,
    choiceQuestionCount: p.questions.filter((q) => q.questionType === 'MULTIPLE_CHOICE').length,
    descriptiveQuestionCount: p.questions.filter((q) => q.questionType === 'DESCRIPTIVE_400').length,
  };
}

/** トラップ種別 → そのトラップを含む選択問題がある文章ID（出題順）。 */
export function buildTrapIndex(passages: readonly PassageItem[]): TrapIndex {
  const index = Object.fromEntries(ACTIVE_TRAP_TYPES.map((t) => [t, [] as string[]])) as TrapIndex;
  for (const passage of passages) {
    for (const trap of ACTIVE_TRAP_TYPES) {
      const has = passage.questions.some(
        (q) => q.questionType === 'MULTIPLE_CHOICE' && q.choices.some((c) => c.primaryTrapType === trap),
      );
      if (has) index[trap].push(passage.id);
    }
  }
  return index;
}

/** 特訓モードの遷移先URL。queue には「この文章の後に続く文章ID」を入れる。 */
export function buildPracticeHref(passageId: string, trap: ActiveTrapType | null, queue: readonly string[] = []): string {
  const base = `/practice/${encodeURIComponent(passageId)}`;
  if (!trap) return base;
  const params = new URLSearchParams({ trap });
  if (queue.length > 0) params.set('queue', queue.join(','));
  return `${base}?${params.toString()}`;
}
