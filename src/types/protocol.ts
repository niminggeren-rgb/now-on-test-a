import type { ActiveTrapType } from '@/types/domain';

/**
 * 統一思考プロトコル【Vernacular Protocol】。
 * AI メンター・音声朗読・論理ダイアグラム・答案ワークベンチ・弱点マトリクスが共通で参照する型と定数。
 */

export type ProtocolStepId = 'STEP_1' | 'STEP_2' | 'STEP_3' | 'STEP_4';
export const PROTOCOL_STEP_IDS: readonly ProtocolStepId[] = ['STEP_1', 'STEP_2', 'STEP_3', 'STEP_4'];

export interface ProtocolStepMeta {
  id: ProtocolStepId;
  stepNumber: 1 | 2 | 3 | 4;
  codeName: 'Macro Scan' | 'Micro Deconstruct' | 'Focus Navigation' | 'Segment Elimination';
  japaneseTitle: string;
  directive: string;
}

export const VERNACULAR_PROTOCOL_STEPS: Record<ProtocolStepId, ProtocolStepMeta> = {
  STEP_1: {
    id: 'STEP_1',
    stepNumber: 1,
    codeName: 'Macro Scan',
    japaneseTitle: '全体構造スキャン',
    directive: 'タイトル・出典・導入から「二項対立（A概念 vs B概念）」と筆者の立場を特定・固定する。',
  },
  STEP_2: {
    id: 'STEP_2',
    stepNumber: 2,
    codeName: 'Micro Deconstruct',
    japaneseTitle: '傍線部の論理解体',
    directive: '傍線部内の指示語・主述関係を分解し、設問要求が「理由（なぜ）」か「換言（どういうことか）」かを確定する。',
  },
  STEP_3: {
    id: 'STEP_3',
    stepNumber: 3,
    codeName: 'Focus Navigation',
    japaneseTitle: '根拠範囲の探索',
    directive: '論理マーカー（しかし・つまり・したがって等）を起点に、本文中の同値・因果エリアを特定する。',
  },
  STEP_4: {
    id: 'STEP_4',
    stepNumber: 4,
    codeName: 'Segment Elimination',
    japaneseTitle: '選択肢の節分割と傷の特定',
    directive: '選択肢を3節（前件／因果結節／後件）にスラッシュ分割し、6大トラップを照合して消去する。',
  },
};

/** Step 4: 選択肢消去で用いる6大トラップ */
export type OptionTrapType =
  | 'overstatement'
  | 'causal_reversal'
  | 'substitution'
  | 'unmentioned'
  | 'subject_object_inversion'
  | 'local_contradiction';

export const OPTION_TRAP_TYPES: readonly OptionTrapType[] = [
  'overstatement',
  'causal_reversal',
  'substitution',
  'unmentioned',
  'subject_object_inversion',
  'local_contradiction',
];

export interface OptionTrapMeta {
  type: OptionTrapType;
  label: string;
  shortLabel: string;
  description: string;
  checkPoint: string;
}

export const SIX_MAJOR_TRAPS: Record<OptionTrapType, OptionTrapMeta> = {
  overstatement: {
    type: 'overstatement',
    label: '言い過ぎ（極端化）',
    shortLabel: '言い過ぎ',
    description: '「すべて」「決して〜ない」「唯一」など、本文の限定条件を超えて断定する傷。',
    checkPoint: '程度副詞・限定表現が本文の温度感と一致しているか？',
  },
  causal_reversal: {
    type: 'causal_reversal',
    label: '因果逆転（結節ミス）',
    shortLabel: '因果逆転',
    description: '「〜ため」「〜によって」「〜その結果」の前後の因果関係が本文と逆、または無関係な傷。',
    checkPoint: '選択肢の節と節をつなぐ「から・ため・ことで」の矢印の向きは本文通りか？',
  },
  substitution: {
    type: 'substitution',
    label: '概念すり替え（対比混同）',
    shortLabel: 'すり替え',
    description: 'Step 1で特定した二項対立（A概念 vs B概念）の要素を密かに混ぜ合わせる傷。',
    checkPoint: 'マイナス側（A概念）の属性がプラス側（B概念）の説明に紛れ込んでいないか？',
  },
  unmentioned: {
    type: 'unmentioned',
    label: '本文言及なし（飛躍）',
    shortLabel: '言及なし',
    description: '一般常識としてはもっともらしいが、本文の論理展開には一切書かれていない傷。',
    checkPoint: '自分の背景知識や道徳観で勝手にストーリーを補っていないか？',
  },
  subject_object_inversion: {
    type: 'subject_object_inversion',
    label: '主客転倒（主述ねじれ）',
    shortLabel: '主客転倒',
    description: '「誰が」「何を」どうするのかという動作主・対象の対応関係が入れ替わっている傷。',
    checkPoint: '各節の主語と目的語ペアが本文の主述関係と厳密に対応しているか？',
  },
  local_contradiction: {
    type: 'local_contradiction',
    label: '局所矛盾（事実不一致）',
    shortLabel: '局所矛盾',
    description: '根拠段落の具体的な記述内容と明確に食い違っている傷。',
    checkPoint: 'Step 3で特定した根拠文の述語（肯定・否定）と真逆になっていないか？',
  },
};

/** 既存の演習ドメイン（`@/types/domain`）のトラップ名との対応 */
export const DOMAIN_TO_PROTOCOL_TRAP: Record<ActiveTrapType, OptionTrapType> = {
  OVERSTATEMENT: 'overstatement',
  CAUSAL_REVERSAL: 'causal_reversal',
  CONCEPT_SWAP: 'substitution',
  UNMENTIONED: 'unmentioned',
  SUBJECT_OBJECT_FLIP: 'subject_object_inversion',
  PARTIAL_CONTRADICTION: 'local_contradiction',
};

/** Step 3: 論理マーカー種別（音声朗読・本文ハイライト共通） */
export type LogicalMarkerCategory = 'adversative' | 'paraphrase' | 'causal' | 'contrast' | 'restriction';

export interface LogicalMarkerToken {
  surface: string;
  category: LogicalMarkerCategory;
  protocolStepRelevance: 'STEP_1' | 'STEP_3';
  pauseDurationMs: number;
  pitchMultiplier: number;
  rateMultiplier: number;
}

/** Step 1: 二項対立・論理構造マップ */
export interface BinaryOppositionAxis {
  poleLabel: string;
  stance: 'critique' | 'advocate' | 'neutral';
  keywords: string[];
  coreAttributes: string[];
  paragraphs: number[];
}

export interface ComparisonDimension {
  dimensionName: string;
  axisAValue: string;
  axisBValue: string;
}

export interface LogicTreeNode {
  id: string;
  paragraphNumbers: number[];
  role: 'problem_statement' | 'antithesis' | 'turning_point' | 'thesis' | 'elaboration';
  roleLabel: string;
  summary: string;
  logicalMarkerUsed?: string;
  nextNodeIds: string[];
}

export interface LogicDiagramData {
  passageTitle: string;
  authorName: string;
  centralQuestion: string;
  axisA: BinaryOppositionAxis;
  axisB: BinaryOppositionAxis;
  dimensions: ComparisonDimension[];
  synthesisThesis: string;
  logicTree: LogicTreeNode[];
}

/** トラップ別の遭遇・失点統計 */
export type TrapFailureStats = Record<OptionTrapType, { encountered: number; failed: number; failureRate: number }>;

/**
 * プロトコル別弱点マトリクス。
 * 計測できていない Step のスコアは null（初期値のダミー点数は持たない）。
 */
export interface ProtocolWeaknessMatrix {
  /** 未ログインの端末内記録は 'local' */
  userId: string;
  totalAttempts: number;
  step1MacroScore: number | null;
  step2DeconstructScore: number | null;
  step3NavigationScore: number | null;
  step4EliminationScore: number | null;
  weakestStep: ProtocolStepId;
  trapStats: TrapFailureStats;
  /** 失点が一度も無ければ null */
  mostFrequentTrap: OptionTrapType | null;
  clinicalPrescription: string;
  updatedAt: string;
}

/**
 * 1問ごとのプロトコル評価入力。
 * Step 1〜3 の直接計測値（0〜1 / 段落番号）は任意。無い場合は選択肢のトラップ種別から推定する。
 */
export interface QuestionAttemptEvaluationInput {
  userId: string;
  passageId: string;
  questionId: string;
  selectedChoiceId: string;
  correctChoiceId: string;
  isCorrect: boolean;
  step1BinaryMatchAccuracy?: number | null;
  step2DeconstructAccuracy?: number | null;
  studentReferencedParagraphs?: number[];
  correctEvidenceParagraphs?: number[];
  /** 不正解のとき、選んだ選択肢のトラップ */
  selectedChoiceTrap?: OptionTrapType;
  /** 全誤答選択肢のトラップ */
  allChoicesTraps: OptionTrapType[];
  /** 選択肢の節分割（スラッシュ）・消去の実施度 0〜1 */
  slashSegmentationQuality: number;
}

export interface AttemptStepScores {
  step1Delta: number | null;
  step2Delta: number | null;
  step3Delta: number | null;
  step4Delta: number;
}

/** AI メンター */
export interface MentorChatMessage {
  role: 'user' | 'assistant';
  content: string;
  activeStep?: ProtocolStepId;
}

/** 画像仕分けワークベンチ */
export type DocumentPageCategory = 'passage' | 'questions' | 'official_answer' | 'student_sheet' | 'diagram';

export interface StudentStep4TraceLog {
  questionLabel: string;
  selectedOptionByStudent: string;
  correctOptionFromRedPen: string;
  isCorrect: boolean;
  /** 全誤答選択肢のトラップ、および生徒が選んだ（誤答の）選択肢のトラップ */
  allChoicesTraps: OptionTrapType[];
  selectedChoiceTrap?: OptionTrapType;
  blackPencilTraces: {
    hasSlashSegmentation: boolean;
    crossedOutOptions: string[];
    underlinedMarkersInPassage: string[];
    detectedWeakStep: ProtocolStepId;
  };
  redPenCorrections: {
    markingSymbol: 'correct_circle' | 'incorrect_cross' | 'triangle_partial';
    writtenMemo: string;
    inferredTrapType?: OptionTrapType;
  };
}

export interface ClassifiedPageItem {
  id: string;
  fileName: string;
  previewUrl: string;
  pageOrder: number;
  category: DocumentPageCategory;
  extractedText: string;
  isVerifiedByUser: boolean;
}
