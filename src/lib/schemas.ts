import { z } from 'zod';

export const activeTrapTypeSchema = z.enum([
  'OVERSTATEMENT',
  'CAUSAL_REVERSAL',
  'CONCEPT_SWAP',
  'UNMENTIONED',
  'SUBJECT_OBJECT_FLIP',
  'PARTIAL_CONTRADICTION',
]);
export const trapTypeSchema = z.union([z.literal('NONE'), activeTrapTypeSchema]);

export const eliminationStateSchema = z.object({
  eliminated: z.boolean(),
  userTaggedTrap: activeTrapTypeSchema.nullable(),
  slashedSegment: z.string().nullable(),
});

export const eliminationTraceEntrySchema = eliminationStateSchema.extend({
  actualTrap: trapTypeSchema,
  isTrapMatch: z.boolean(),
});

export const answerLogSchema = z.object({
  id: z.string(),
  passageId: z.string(),
  questionId: z.string(),
  selectedChoiceLabel: z.number().int().nullable(),
  isCorrect: z.boolean(),
  eliminationTrace: z.record(z.string(), eliminationTraceEntrySchema),
  timeSpentMs: z.number().int().nonnegative(),
  confidenceLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  createdAt: z.string(),
});

export const trapWeaknessStatSchema = z.object({
  trapType: activeTrapTypeSchema,
  encounteredCount: z.number().int().nonnegative(),
  trappedCount: z.number().int().nonnegative(),
  correctlyTaggedCount: z.number().int().nonnegative(),
  weaknessScore: z.number().min(0).max(100),
});

export const mockExamRecordSchema = z.object({
  id: z.string(),
  examProvider: z.string(),
  examName: z.string(),
  examDate: z.string(),
  modernJapaneseScore: z.number(),
  modernJapaneseMaxScore: z.number(),
  deviationValue: z.number(),
  selfReflection: z.string(),
  aiOverallAdvice: z.string().optional(),
  analyzedWeaknesses: z.array(z.string()).optional(),
});

/** 回答送信の入力（Server Action / クライアント共通）。 */
export const submitAnswerInputSchema = z.object({
  passageId: z.string().min(1),
  questionId: z.string().min(1),
  selectedChoiceLabel: z.number().int().min(1).max(5),
  elimination: z.record(z.string(), eliminationStateSchema),
  timeSpentMs: z.number().int().nonnegative(),
  confidenceLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().default(null),
});
export type SubmitAnswerInput = z.input<typeof submitAnswerInputSchema>;

/** 模試登録の入力。 */
export const mockExamInputSchema = z
  .object({
    examProvider: z.string().trim().min(1, '模試の主催を入力してください'),
    examName: z.string().trim().min(1, '模試名を入力してください'),
    examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付形式が正しくありません'),
    modernJapaneseScore: z.number().min(0, '0以上で入力してください'),
    modernJapaneseMaxScore: z.number().positive('満点は1以上で入力してください'),
    deviationValue: z.number().min(0).max(100),
    selfReflection: z.string().default(''),
  })
  .refine((v) => v.modernJapaneseScore <= v.modernJapaneseMaxScore, {
    message: '素点が満点を超えています',
    path: ['modernJapaneseScore'],
  });
export type MockExamInput = z.input<typeof mockExamInputSchema>;
