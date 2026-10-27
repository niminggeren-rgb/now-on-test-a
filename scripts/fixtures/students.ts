import { computeWeaknessScore } from '@/lib/scoring';
import type { ActiveTrapType, MockExamRecord, TrapWeaknessStat } from '@/types/domain';
import type { DescriptiveAttemptRecord, StudentRecord } from '@/types/instructor';

// デモ用の架空の生徒データ（実在の人物とは無関係）。

type Counts = Record<ActiveTrapType, [encountered: number, trapped: number, tagged: number]>;

function stats(c: Counts): TrapWeaknessStat[] {
  return (Object.entries(c) as [ActiveTrapType, [number, number, number]][]).map(([trapType, [e, t, g]]) => ({
    trapType,
    encounteredCount: e,
    trappedCount: t,
    correctlyTaggedCount: g,
    weaknessScore: computeWeaknessScore(e, t, g),
  }));
}

function exam(id: string, provider: string, name: string, date: string, score: number, dev: number, note = ''): MockExamRecord {
  return {
    id,
    examProvider: provider,
    examName: name,
    examDate: date,
    modernJapaneseScore: score,
    modernJapaneseMaxScore: 100,
    deviationValue: dev,
    selfReflection: note,
  };
}

const TITLE = '透明化する身体と近代的空間の逆説';
const PROMPT = '均質化された空間における「自由」の批判と、リアリティ回復に必要なこと（400字）';
const ELEMENTS = ['透明な空間の問題点', '「自由」への批判', '対比構造の明示', '回復の方策'] as const;
const rubric = (earned: [number, number, number, number]) => ELEMENTS.map((element, i) => ({ element, earned: earned[i] ?? 0, max: 25 }));

function attempt(
  id: string,
  date: string,
  score: number,
  earned: [number, number, number, number],
  answerExcerpt: string,
  aiFeedback: string,
): DescriptiveAttemptRecord {
  return { id, date, passageTitle: TITLE, promptSummary: PROMPT, score, answerExcerpt, aiFeedback, rubric: rubric(earned) };
}

export const MOCK_STUDENTS: readonly StudentRecord[] = [
  {
    id: 'student-sato',
    name: '佐藤 健太',
    grade: '高3',
    targetUniversity: '早稲田大学 政治経済学部',
    targetTier: 'SOKEI',
    streakDays: 21,
    accuracy: 58,
    avgSeconds: 118,
    stats: stats({
      OVERSTATEMENT: [28, 2, 24],
      CAUSAL_REVERSAL: [26, 5, 19],
      CONCEPT_SWAP: [30, 3, 26],
      UNMENTIONED: [22, 3, 17],
      SUBJECT_OBJECT_FLIP: [20, 3, 14],
      PARTIAL_CONTRADICTION: [40, 21, 11],
    }),
    exams: [
      exam('sato-e1', '河合塾', '第1回 全統記述模試', '2026-04-19', 60, 58.2, '選択肢の後半を読まずに選んで落とした。'),
      exam('sato-e2', '駿台', '駿台全国模試 第1回', '2026-06-14', 65, 61.0),
      exam('sato-e3', '東進', '早慶レベル記述模試', '2026-08-30', 68, 62.5, '時間は余ったが、最後の述語の見落としが2問。'),
    ],
    descriptiveAttempts: [
      attempt(
        'sato-a1',
        '2026-10-18',
        74,
        [25, 20, 17, 12],
        '近代の都市空間は摩擦のない透明な空間として設計され、効率が高まる一方で抵抗やノイズが排除されている。身体は記号的な端末だと錯覚され…',
        '対比の骨格は正確ですが、結論で「自然回帰ではなく」の限定が抜けています。',
      ),
    ],
    seedComments: [],
  },
  {
    id: 'student-takahashi',
    name: '高橋 美咲',
    grade: '高3',
    targetUniversity: '慶應義塾大学 文学部',
    targetTier: 'SOKEI',
    streakDays: 9,
    accuracy: 64,
    avgSeconds: 165,
    stats: stats({
      OVERSTATEMENT: [26, 3, 21],
      CAUSAL_REVERSAL: [24, 4, 18],
      CONCEPT_SWAP: [30, 13, 14],
      UNMENTIONED: [24, 9, 11],
      SUBJECT_OBJECT_FLIP: [20, 3, 15],
      PARTIAL_CONTRADICTION: [26, 5, 17],
    }),
    exams: [
      exam('taka-e1', '河合塾', '第1回 全統記述模試', '2026-04-19', 63, 59.4),
      exam('taka-e2', '駿台', '駿台全国模試 第1回', '2026-06-14', 61, 58.0, '対比の取り違えで大きく失点。'),
      exam('taka-e3', '河合塾', '第3回 全統記述模試', '2026-10-11', 70, 63.8),
    ],
    descriptiveAttempts: [
      attempt(
        'taka-a1',
        '2026-10-20',
        81,
        [25, 22, 18, 16],
        '筆者は、透明な空間が効率を優先して摩擦を排除し、身体を記号的なインターフェースと錯覚させる点を批判する。これに対し…',
        '丁寧に書けています。「偶発的な摩擦」と「不自由さ」の関係を因果で明示すると満点圏です。',
      ),
      attempt(
        'taka-a2',
        '2026-10-06',
        66,
        [22, 18, 14, 12],
        '現代では便利さが重視され、人間は身体を使わなくなっている。だから不便さを取り戻すべきだと筆者は言う。',
        '「不便を礼賛する」趣旨に読めます。本文は「異物感・手触りの回復」であり、不便の肯定ではありません。',
      ),
    ],
    seedComments: [
      {
        id: 'seed-c1',
        studentId: 'student-takahashi',
        attemptId: 'taka-a2',
        text: '結論が「不便の礼賛」に寄っている。第4段落の「不便を礼賛することではない」を再確認させる。',
        createdAt: '2026-10-07T10:30:00+09:00',
      },
    ],
  },
  {
    id: 'student-tanaka',
    name: '田中 陸',
    grade: '既卒',
    targetUniversity: '東京大学 文科二類',
    targetTier: 'TOKYO_KYOTO',
    streakDays: 34,
    accuracy: 71,
    avgSeconds: 205,
    stats: stats({
      OVERSTATEMENT: [30, 9, 16],
      CAUSAL_REVERSAL: [28, 8, 15],
      CONCEPT_SWAP: [26, 3, 21],
      UNMENTIONED: [24, 2, 21],
      SUBJECT_OBJECT_FLIP: [22, 2, 19],
      PARTIAL_CONTRADICTION: [28, 4, 22],
    }),
    exams: [
      exam('tana-e1', '駿台', '駿台東大実戦模試 第1回', '2026-05-24', 66, 63.8),
      exam('tana-e2', '河合塾', '東大オープン 第1回', '2026-08-23', 69, 65.2),
      exam('tana-e3', '駿台', '駿台東大実戦模試 第2回', '2026-10-18', 72, 66.9, '記述は安定。選択問題の言い過ぎで1問。'),
    ],
    descriptiveAttempts: [
      attempt(
        'tana-a1',
        '2026-10-22',
        92,
        [25, 25, 22, 20],
        '筆者は、近代の都市空間や情報環境が摩擦のない透明な空間を理想として設計され、移動や伝達の効率性が高まる一方で…',
        '要素はほぼ網羅。「単なる自然回帰ではなく」の限定まで書けています。',
      ),
    ],
    seedComments: [],
  },
  {
    id: 'student-ito',
    name: '伊藤 さくら',
    grade: '高2',
    targetUniversity: '明治大学 政治経済学部',
    targetTier: 'MARCH',
    streakDays: 4,
    accuracy: 52,
    avgSeconds: 150,
    stats: stats({
      OVERSTATEMENT: [18, 6, 8],
      CAUSAL_REVERSAL: [16, 4, 8],
      CONCEPT_SWAP: [14, 3, 8],
      UNMENTIONED: [16, 5, 7],
      SUBJECT_OBJECT_FLIP: [14, 6, 5],
      PARTIAL_CONTRADICTION: [18, 5, 9],
    }),
    exams: [
      exam('ito-e1', '河合塾', '第2回 全統高2記述模試', '2026-06-28', 52, 52.4),
      exam('ito-e2', '駿台', '駿台高2全国模試', '2026-09-20', 55, 54.1),
    ],
    descriptiveAttempts: [
      attempt(
        'ito-a1',
        '2026-10-15',
        48,
        [18, 10, 8, 12],
        '現代の空間は便利になりすぎて、人はすべての感覚を失ってしまった。だから昔のように不便な生活に戻るべきだ。',
        '「すべての感覚を失った」は言い過ぎ、「昔に戻る」は本文が否定している自然回帰です。',
      ),
    ],
    seedComments: [],
  },
];

export function findStudent(id: string): StudentRecord | undefined {
  return MOCK_STUDENTS.find((s) => s.id === id);
}
