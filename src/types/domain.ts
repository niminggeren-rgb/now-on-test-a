export type UserRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
export type TargetTier = 'MARCH' | 'SOKEI' | 'NATIONAL_HARD' | 'TOKYO_KYOTO';
export type PassageTheme =
  | 'PHILOSOPHY'
  | 'SOCIOLOGY'
  | 'AESTHETICS'
  | 'LINGUISTICS'
  | 'SCIENCE_ETHICS'
  | 'CULTURE';

export type QuestionType = 'MULTIPLE_CHOICE' | 'DESCRIPTIVE_400';

export type TrapType =
  | 'NONE'
  | 'OVERSTATEMENT'
  | 'CAUSAL_REVERSAL'
  | 'CONCEPT_SWAP'
  | 'UNMENTIONED'
  | 'SUBJECT_OBJECT_FLIP'
  | 'PARTIAL_CONTRADICTION';

export type ActiveTrapType = Exclude<TrapType, 'NONE'>;

export interface TrapMetadata {
  type: ActiveTrapType;
  keyNumber: number;
  label: string;
  shortLabel: string;
  description: string;
  checkPoint: string;
  badgeColorClass: string;
  borderColorClass: string;
}

export const TRAP_METADATA_MAP: Record<ActiveTrapType, TrapMetadata> = {
  OVERSTATEMENT: {
    type: 'OVERSTATEMENT',
    keyNumber: 1,
    label: '言い過ぎ・極端な断定',
    shortLabel: '言い過ぎ',
    description: '本文の部分的な主張を「常に」「一切〜ない」「のみ」など極端な全称命題に飛躍させるトラップ。',
    checkPoint: '副詞（全く・必ず・単に）や限定表現が本文のニュアンスを超えていないか？',
    badgeColorClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    borderColorClass: 'border-rose-500/50',
  },
  CAUSAL_REVERSAL: {
    type: 'CAUSAL_REVERSAL',
    keyNumber: 2,
    label: '因果関係の逆転・ねじれ',
    shortLabel: '因果逆転',
    description: '本文にあるA（原因）とB（結果）の矢印を逆転させる、あるいは無関係な2要素を「〜ため」「〜によって」で結ぶトラップ。',
    checkPoint: '「〜から」「〜によって」「〜をもたらす」の前後の矢印の向きは本文と一致しているか？',
    badgeColorClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    borderColorClass: 'border-amber-500/50',
  },
  CONCEPT_SWAP: {
    type: 'CONCEPT_SWAP',
    keyNumber: 3,
    label: '概念・対比軸のすり替え',
    shortLabel: '概念すり替え',
    description: '本文の二項対立（例：近代 vs 前近代、記号 vs 身体）の一方の特徴を他方の説明に紛れ込ませる難関大頻出トラップ。',
    checkPoint: '本文で対比されているA群とB群のキーワードが選択肢内でクロスしていないか？',
    badgeColorClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    borderColorClass: 'border-purple-500/50',
  },
  UNMENTIONED: {
    type: 'UNMENTIONED',
    keyNumber: 4,
    label: '本文言及なし・常識混入',
    shortLabel: '言及なし',
    description: '一見もっともらしい一般常識や道徳的正論だが、当該評論文の論理展開には一切書かれていない要素を混入させるトラップ。',
    checkPoint: '「自分の知識では正しそう」でも、本文中に明確な対応根拠箇所（傍証）を指摘できるか？',
    badgeColorClass: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    borderColorClass: 'border-slate-500/50',
  },
  SUBJECT_OBJECT_FLIP: {
    type: 'SUBJECT_OBJECT_FLIP',
    keyNumber: 5,
    label: '主客転倒・主体の取り違え',
    shortLabel: '主客転倒',
    description: '「誰が」「何を」規定・認識しているのかという行為主体と客体の関係を入れ替えるトラップ。',
    checkPoint: '述語に対する主語・動作主は、筆者の立場か、それとも筆者が批判する一般論の立場か？',
    badgeColorClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    borderColorClass: 'border-cyan-500/50',
  },
  PARTIAL_CONTRADICTION: {
    type: 'PARTIAL_CONTRADICTION',
    keyNumber: 6,
    label: '前半合致・後半の局所矛盾',
    shortLabel: '局所矛盾',
    description: '選択肢の8割を本文通りに精巧に記述して安心させ、末尾の述語や修飾語1箇所だけを本文と逆にするトラップ。',
    checkPoint: '選択肢を「／」で3〜4節に区切り、最後の述語まで全ての節を本文と照合したか？',
    badgeColorClass: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
    borderColorClass: 'border-pink-500/50',
  },
};

export interface UnderlineSpan {
  id: string;
  label: string; // 例: "傍線部(A)"
  text: string; // 傍線対象の文字列（本文内でハイライト変換用）
}

export interface PassageParagraph {
  paragraphNumber: number;
  text: string;
  underlines?: UnderlineSpan[];
}

export interface LogicalStructureSummary {
  mainThesis: string;
  contrastAxis: {
    negativePoleTitle: string;
    negativePoleKeywords: string[];
    positivePoleTitle: string;
    positivePoleKeywords: string[];
  };
  paragraphRoles: { paragraphNumber: number; role: string; summary: string }[];
}

export interface ChoiceClause {
  text: string;
  status: 'VALID' | 'FLAWED' | 'NEUTRAL';
  comment: string;
}

export interface ChoiceItem {
  id: string;
  questionId: string;
  choiceLabel: number; // 1..4
  content: string;
  isCorrect: boolean;
  primaryTrapType: TrapType;
  flawSegmentText: string | null;
  clauseBreakdown: ChoiceClause[];
  trapExplanation: string;
}

export interface LogicalStep {
  stepNumber: number;
  title: string;
  content: string;
}

export interface GradingRubricItem {
  id: string;
  element: string;
  points: number;
  keywords: string[];
}

export interface QuestionItem {
  id: string;
  passageId: string;
  questionNumber: number;
  questionType: QuestionType;
  promptText: string;
  targetUnderlineId: string | null;
  correctChoiceLabel: number | null;
  descriptiveCharLimit?: number;
  modelAnswerText?: string;
  gradingRubric?: GradingRubricItem[];
  logicalDerivationSteps: LogicalStep[];
  explanationSummary: string;
  choices: ChoiceItem[];
}

export interface PassageItem {
  id: string;
  title: string;
  author: string;
  sourceWork: string;
  theme: PassageTheme;
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  targetTier: TargetTier;
  charCount: number;
  standardTimeSeconds: number;
  paragraphs: PassageParagraph[];
  logicalStructure: LogicalStructureSummary;
  questions: QuestionItem[];
}

export interface ChoiceEliminationState {
  eliminated: boolean;
  userTaggedTrap: ActiveTrapType | null;
  slashedSegment: string | null;
}

export interface TrapWeaknessStat {
  trapType: ActiveTrapType;
  encounteredCount: number;
  trappedCount: number;
  correctlyTaggedCount: number;
  weaknessScore: number; // 0-100
}

export interface MockExamRecord {
  id: string;
  examProvider: string;
  examName: string;
  examDate: string;
  modernJapaneseScore: number;
  modernJapaneseMaxScore: number;
  deviationValue: number;
  selfReflection: string;
  aiOverallAdvice?: string;
  analyzedWeaknesses?: string[];
}

export interface EliminationTraceEntry {
  eliminated: boolean;
  userTaggedTrap: ActiveTrapType | null;
  slashedSegment: string | null;
  actualTrap: TrapType;
  isTrapMatch: boolean;
}

export interface AnswerLog {
  id: string;
  passageId: string;
  questionId: string;
  selectedChoiceLabel: number | null;
  isCorrect: boolean;
  /** キーは選択肢番号の文字列（"1"〜"4"）。DB の elimination_trace_json と同形式。 */
  eliminationTrace: Record<string, EliminationTraceEntry>;
  timeSpentMs: number;
  confidenceLevel: 1 | 2 | 3 | null;
  createdAt: string; // ISO 8601
}
