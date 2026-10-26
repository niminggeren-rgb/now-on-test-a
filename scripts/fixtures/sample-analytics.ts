import { applyAnswerToStats, buildEliminationTrace, computeWeaknessScore } from '@/lib/scoring';
import type {
  ActiveTrapType,
  AnswerLog,
  ChoiceEliminationState,
  MockExamRecord,
  TrapWeaknessStat,
} from '@/types/domain';
import { findMockQuestion } from '../../src/lib/mock-data/passages';

// テスト用フィクスチャ。アプリ本体（リポジトリ）の初期データには使用しない。
// 実際の回答履歴・弱点統計・模試は、ユーザーが入力・演習した内容だけから集計する。

// ----------------------------------------------------------------------------
// 直近の回答履歴（新しい順に10件）。正誤・正解トラップは実際の設問データから導出する。
// ----------------------------------------------------------------------------

interface LogSeed {
  questionId: string;
  selected: number;
  /** 選択肢番号 → 生徒が付けたトラップタグ（null は消去したがタグ未指定） */
  tags: Record<number, ActiveTrapType | null>;
  timeSec: number;
  confidence: 1 | 2 | 3;
  createdAt: string;
}

const AEST_Q1 = 'passage-aesthetics-001-q1';
const AEST_Q2 = 'passage-aesthetics-001-q2';
const LING_Q1 = 'passage-linguistics-001-q1';
const LING_Q2 = 'passage-linguistics-001-q2';
const SCI_Q1 = 'passage-science-001-q1';
const SCI_Q2 = 'passage-science-001-q2';

const LOG_SEEDS: readonly LogSeed[] = [
  { questionId: SCI_Q2, selected: 1, tags: { 3: 'CONCEPT_SWAP', 4: 'SUBJECT_OBJECT_FLIP' }, timeSec: 142, confidence: 2, createdAt: '2026-10-25T20:41:00+09:00' },
  { questionId: SCI_Q1, selected: 4, tags: { 1: 'OVERSTATEMENT', 2: 'CAUSAL_REVERSAL', 3: 'UNMENTIONED' }, timeSec: 96, confidence: 3, createdAt: '2026-10-25T20:36:00+09:00' },
  { questionId: LING_Q2, selected: 3, tags: { 2: 'CONCEPT_SWAP', 4: 'UNMENTIONED' }, timeSec: 128, confidence: 2, createdAt: '2026-10-24T21:12:00+09:00' },
  { questionId: LING_Q1, selected: 2, tags: { 1: 'OVERSTATEMENT', 3: 'CONCEPT_SWAP', 4: 'SUBJECT_OBJECT_FLIP' }, timeSec: 88, confidence: 3, createdAt: '2026-10-24T21:05:00+09:00' },
  { questionId: AEST_Q2, selected: 4, tags: { 1: 'SUBJECT_OBJECT_FLIP', 2: 'CONCEPT_SWAP', 3: 'UNMENTIONED' }, timeSec: 151, confidence: 2, createdAt: '2026-10-23T19:48:00+09:00' },
  { questionId: AEST_Q1, selected: 2, tags: { 1: 'OVERSTATEMENT', 4: 'CONCEPT_SWAP' }, timeSec: 174, confidence: 1, createdAt: '2026-10-23T19:40:00+09:00' },
  { questionId: AEST_Q2, selected: 2, tags: { 1: 'SUBJECT_OBJECT_FLIP', 3: 'OVERSTATEMENT' }, timeSec: 163, confidence: 2, createdAt: '2026-10-21T20:20:00+09:00' },
  { questionId: SCI_Q1, selected: 2, tags: { 1: 'OVERSTATEMENT', 3: 'UNMENTIONED' }, timeSec: 120, confidence: 2, createdAt: '2026-10-21T20:08:00+09:00' },
  { questionId: LING_Q1, selected: 1, tags: { 3: 'CAUSAL_REVERSAL', 4: null }, timeSec: 99, confidence: 1, createdAt: '2026-10-19T21:30:00+09:00' },
  { questionId: AEST_Q1, selected: 3, tags: { 1: 'OVERSTATEMENT', 2: 'CAUSAL_REVERSAL', 4: 'CONCEPT_SWAP' }, timeSec: 190, confidence: 2, createdAt: '2026-10-19T21:15:00+09:00' },
];

function seedToLog(seed: LogSeed, index: number): AnswerLog {
  const found = findMockQuestion(seed.questionId);
  if (!found) throw new Error(`mock question not found: ${seed.questionId}`);
  const { passage, question } = found;

  const elimination: Record<string, ChoiceEliminationState> = {};
  for (const [label, tag] of Object.entries(seed.tags)) {
    elimination[label] = { eliminated: true, userTaggedTrap: tag, slashedSegment: null };
  }
  return {
    id: `seed-log-${String(index + 1).padStart(2, '0')}`,
    passageId: passage.id,
    questionId: question.id,
    selectedChoiceLabel: seed.selected,
    isCorrect: question.correctChoiceLabel === seed.selected,
    eliminationTrace: buildEliminationTrace(question, elimination),
    timeSpentMs: seed.timeSec * 1000,
    confidenceLevel: seed.confidence,
    createdAt: seed.createdAt,
  };
}

export const INITIAL_ANSWER_LOGS: readonly AnswerLog[] = LOG_SEEDS.map(seedToLog);

// ----------------------------------------------------------------------------
// トラップ別統計: 過去の蓄積 + 上記10件の反映
// ----------------------------------------------------------------------------

const PRIOR_COUNTS: readonly [ActiveTrapType, number, number, number][] = [
  // [trap, encountered, trapped(引っかかった), correctlyTagged(見破った)]
  ['OVERSTATEMENT', 24, 3, 20],
  ['CAUSAL_REVERSAL', 22, 8, 12],
  ['CONCEPT_SWAP', 20, 4, 13],
  ['UNMENTIONED', 18, 3, 14],
  ['SUBJECT_OBJECT_FLIP', 16, 4, 10],
  ['PARTIAL_CONTRADICTION', 20, 10, 8],
];

const PRIOR_STATS: TrapWeaknessStat[] = PRIOR_COUNTS.map(([trapType, encounteredCount, trappedCount, correctlyTaggedCount]) => ({
  trapType,
  encounteredCount,
  trappedCount,
  correctlyTaggedCount,
  weaknessScore: computeWeaknessScore(encounteredCount, trappedCount, correctlyTaggedCount),
}));

function foldLogs(base: TrapWeaknessStat[], logs: readonly AnswerLog[]): TrapWeaknessStat[] {
  // 古い順に適用する
  return [...logs].reverse().reduce<TrapWeaknessStat[]>((stats, log) => {
    const found = findMockQuestion(log.questionId);
    return found ? applyAnswerToStats(stats, found.question, log.selectedChoiceLabel, log.eliminationTrace) : stats;
  }, base);
}

export const INITIAL_TRAP_STATS: readonly TrapWeaknessStat[] = foldLogs(PRIOR_STATS, INITIAL_ANSWER_LOGS);

// ----------------------------------------------------------------------------
// 模試成績（4回分、古い順）
// ----------------------------------------------------------------------------

export const INITIAL_MOCK_EXAMS: readonly MockExamRecord[] = [
  {
    id: 'seed-exam-1',
    examProvider: '河合塾',
    examName: '第1回 全統記述模試',
    examDate: '2026-04-19',
    modernJapaneseScore: 58,
    modernJapaneseMaxScore: 100,
    deviationValue: 56.3,
    selfReflection: '選択肢の後半を読み切らずに選んだ設問で3問落とした。記述は要素の抜けが目立った。',
    aiOverallAdvice: '選択肢を節ごとに区切り、最後の述語まで本文と照合する習慣をつけましょう。',
    analyzedWeaknesses: ['PARTIAL_CONTRADICTION', 'CAUSAL_REVERSAL'],
  },
  {
    id: 'seed-exam-2',
    examProvider: '駿台',
    examName: '駿台全国模試 第1回',
    examDate: '2026-06-14',
    modernJapaneseScore: 62,
    modernJapaneseMaxScore: 100,
    deviationValue: 58.9,
    selfReflection: '対比構造は取れたが、因果の向きの確認が甘く、傍線部の理由説明で失点した。',
    aiOverallAdvice: '「〜から」「〜によって」の前後の矢印の向きを、傍線部ごとに書き出して確認しましょう。',
    analyzedWeaknesses: ['CAUSAL_REVERSAL', 'CONCEPT_SWAP'],
  },
  {
    id: 'seed-exam-3',
    examProvider: '東進',
    examName: '早慶レベル記述模試',
    examDate: '2026-08-30',
    modernJapaneseScore: 66,
    modernJapaneseMaxScore: 100,
    deviationValue: 61.4,
    selfReflection: '言い過ぎ選択肢はほぼ見破れた。一方で、前半が合っている選択肢に引っ張られる傾向が残る。',
    aiOverallAdvice: '前半が完璧に合致する選択肢ほど、末尾の述語を疑う癖をつけると得点が安定します。',
    analyzedWeaknesses: ['PARTIAL_CONTRADICTION'],
  },
  {
    id: 'seed-exam-4',
    examProvider: '河合塾',
    examName: '第3回 全統記述模試',
    examDate: '2026-10-11',
    modernJapaneseScore: 71,
    modernJapaneseMaxScore: 100,
    deviationValue: 64.2,
    selfReflection: '記述で対比の両極を書けた。選択問題は局所矛盾で1問落とした。',
    aiOverallAdvice: '記述は「批判→対比→結論の限定」の型が定着しています。選択問題の局所矛盾対策を継続しましょう。',
    analyzedWeaknesses: ['PARTIAL_CONTRADICTION', 'CAUSAL_REVERSAL'],
  },
];
