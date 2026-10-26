import { ACTIVE_TRAP_TYPES } from '@/lib/scoring';
import type { ActiveTrapType, PassageItem, PassageTheme, TargetTier, TrapType } from '@/types/domain';

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

/** 回答ログの表示用に、設問ID → 文章名・設問番号・選択肢ごとのトラップ を引く索引。 */
export interface QuestionIndexEntry {
  passageId: string;
  passageTitle: string;
  questionNumber: number;
  /** 選択肢番号（文字列） → 実際のトラップ種別 */
  traps: Record<string, TrapType>;
}
export type QuestionIndex = Record<string, QuestionIndexEntry>;

export function buildQuestionIndex(passages: readonly PassageItem[]): QuestionIndex {
  const index: QuestionIndex = {};
  for (const p of passages) {
    for (const q of p.questions) {
      index[q.id] = {
        passageId: p.id,
        passageTitle: p.title,
        questionNumber: q.questionNumber,
        traps: Object.fromEntries(q.choices.map((c) => [String(c.choiceLabel), c.primaryTrapType])),
      };
    }
  }
  return index;
}
