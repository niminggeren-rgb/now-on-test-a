import { z } from 'zod';
import { activeTrapTypeSchema } from '@/lib/schemas';

/**
 * Phase 8: 2段階画像解析・オンデマンド解説の Zod スキーマ。
 * トラップ属性は既存ドメインの6分類（`@/types/domain` の ActiveTrapType）をそのまま使う。
 * （「局所矛盾」は既存名 PARTIAL_CONTRADICTION）
 */
export const TrapTypeEnum = activeTrapTypeSchema;
export type TrapType = z.infer<typeof TrapTypeEnum>;

const optionNumber = z.number().int().min(1).max(10);
const text = z.string().max(4000);

// --- Stage 1: 画像仕分け -------------------------------------------------------
export const ImageDocumentCategoryEnum = z.enum(['PASSAGE', 'QUESTIONS', 'MODEL_ANSWER', 'STUDENT_SHEET', 'DIAGRAM_ONLY']);

export const SingleImageTriageSchema = z.object({
  imageIndex: z.number().int().min(0),
  imageId: z.string(),
  category: ImageDocumentCategoryEnum,
  hasHandwriting: z.boolean(),
  hasDiagramOrIllustration: z.boolean(),
  requiresVisualInspection: z.boolean(),
  discardReasonIfFalse: z.string().nullish(),
  extractedRawText: z.string().max(30000),
});

export const Stage1TriageResponseSchema = z.object({
  items: z.array(SingleImageTriageSchema).max(12),
});
export type Stage1TriageResponse = z.infer<typeof Stage1TriageResponseSchema>;

// --- Stage 2: 黒鉛筆 vs 赤/青ペン分離OCR -----------------------------------------
export const BlackPencilTraceSchema = z.object({
  optionNumber,
  isEliminatedBySlash: z.boolean(),
  underlinedOrCrossedPhrases: z.array(text).max(10),
  marginMemo: z.string().max(500).nullish(),
  inferredStudentTrapReason: TrapTypeEnum.nullable(),
});

export const RedBluePenGradingSchema = z.object({
  gradingMark: z.enum(['CORRECT_CIRCLE', 'INCORRECT_CROSS', 'PARTIAL_TRIANGLE', 'NONE']),
  correctedOptionNumber: optionNumber.nullable(),
  redPenNotes: z.array(text).max(20),
});

export const StructuredChoiceSchema = z.object({
  optionNumber,
  choiceText: text,
  isCorrectAnswer: z.boolean(),
  actualTrapTypes: z.array(TrapTypeEnum).max(6),
  flawSpan: z.string().max(1000).nullable(),
  eliminationReason: text,
});

export const StructuredQuestionItemSchema = z.object({
  questionNumberLabel: z.string().max(50),
  questionPrompt: text,
  underlinedTargetText: z.string().max(2000).nullable(),
  studentInitialSelectedOption: optionNumber.nullable(),
  officialCorrectOption: optionNumber,
  blackPencilTraces: z.array(BlackPencilTraceSchema).max(10),
  redBluePenGrading: RedBluePenGradingSchema,
  choices: z.array(StructuredChoiceSchema).min(2).max(10),
});
export type StructuredQuestionItem = z.infer<typeof StructuredQuestionItemSchema>;

export const Stage2InkSeparatedResponseSchema = z.object({
  passageTitle: z.string().nullable(),
  passageAuthor: z.string().nullable(),
  consolidatedPassageText: z.string().max(40000),
  questions: z.array(StructuredQuestionItemSchema).max(20),
});
export type Stage2InkSeparatedResponse = z.infer<typeof Stage2InkSeparatedResponseSchema>;

// --- オンデマンド解説 ---------------------------------------------------------
export const OnDemandModeEnum = z.enum(['BINARY_OPPOSITION_MAP', 'THINKING_PROCESS']);
export type OnDemandMode = z.infer<typeof OnDemandModeEnum>;

const side = z.object({ label: z.string(), keywords: z.array(z.string()), logicSummary: z.string() });

export const BinaryOppositionMapSchema = z.object({
  coreThesis: z.string(),
  oppositionAxisLabel: z.string(),
  sideA: side,
  sideB: side,
  abstractionToConcreteFlow: z.array(
    z.object({
      paragraphRange: z.string(),
      role: z.enum(['PROBLEM_SETTING', 'COMMON_VIEW', 'COUNTER_ARGUMENT', 'CONCRETE_EXAMPLE', 'CONCLUSION']),
      summary: z.string(),
    }),
  ),
});

export const ThinkingProcessSchema = z.object({
  step1DemonstrativeAndTarget: z.object({
    title: z.string(),
    targetAnalysis: z.string(),
    requiredElements: z.array(z.string()),
  }),
  step2ContrastAndParaphrase: z.object({
    title: z.string(),
    quotedEvidenceSentences: z.array(z.string()),
    paraphraseEquation: z.string(),
  }),
  step3OptionEliminationOrder: z.array(
    z.object({
      rank: z.number().int(),
      optionNumber: z.number().int(),
      verdict: z.enum(['ELIMINATE', 'KEEP_AS_CORRECT']),
      trapType: TrapTypeEnum.nullable(),
      flawQuote: z.string().nullable(),
      logicalReason: z.string(),
    }),
  ),
});

export const OnDemandExplanationResponseSchema = z.object({
  mode: OnDemandModeEnum,
  binaryOppositionMap: BinaryOppositionMapSchema.nullable(),
  thinkingProcess: ThinkingProcessSchema.nullable(),
});
export type OnDemandExplanationResponse = z.infer<typeof OnDemandExplanationResponseSchema>;

/** 解説リクエストに添える選択肢（Gemini へ渡す最小限の情報） */
export const ExplanationChoiceSchema = z.object({
  optionNumber,
  text: z.string().max(1000),
  isCorrect: z.boolean(),
  trapType: z.string().max(40).nullable(),
  flawText: z.string().max(1000).nullable(),
});
export type ExplanationChoice = z.infer<typeof ExplanationChoiceSchema>;

export const OnDemandRequestSchema = z.object({
  mode: OnDemandModeEnum,
  passageText: z.string().trim().min(1).max(20000),
  questionPrompt: z.string().max(2000).default(''),
  choices: z.array(ExplanationChoiceSchema).max(10).default([]),
});
