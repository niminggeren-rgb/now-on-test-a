import { z } from 'zod';

export const ProtocolStepIdSchema = z.enum(['STEP_1', 'STEP_2', 'STEP_3', 'STEP_4']);
export const OptionTrapTypeSchema = z.enum([
  'overstatement',
  'causal_reversal',
  'substitution',
  'unmentioned',
  'subject_object_inversion',
  'local_contradiction',
]);

const paragraphs = z.array(z.string().max(4000)).min(1).max(40);

// --- AI メンター ---------------------------------------------------------------
const trapStat = z.object({ encountered: z.number(), failed: z.number(), failureRate: z.number() });
export const WeaknessMatrixPromptSchema = z.object({
  totalAttempts: z.number().int().min(0),
  step1MacroScore: z.number().nullable(),
  step2DeconstructScore: z.number().nullable(),
  step3NavigationScore: z.number().nullable(),
  step4EliminationScore: z.number().nullable(),
  weakestStep: ProtocolStepIdSchema,
  mostFrequentTrap: OptionTrapTypeSchema.nullable(),
  trapStats: z.record(OptionTrapTypeSchema, trapStat),
  clinicalPrescription: z.string().max(2000),
});
export type WeaknessMatrixPrompt = z.infer<typeof WeaknessMatrixPromptSchema>;

export const MentorChatRequestSchema = z.object({
  passageTitle: z.string().max(200),
  paragraphs,
  questionText: z.string().max(2000),
  underlinedPart: z.string().max(1000),
  underlinedParagraphNumber: z.number().int().min(0).max(40),
  /** 正解の情報は含めない（メンターが直接答えを漏らさないため） */
  choices: z.array(z.object({ id: z.string().max(8), text: z.string().max(1000) })).max(8),
  targetStep: ProtocolStepIdSchema.optional(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(3000) }))
    .min(1)
    .max(30),
  weaknessMatrix: WeaknessMatrixPromptSchema.nullish(),
});
export type MentorChatRequest = z.infer<typeof MentorChatRequestSchema>;

// --- 二項対立ダイアグラム --------------------------------------------------------
export const LogicDiagramRequestSchema = z.object({
  passageTitle: z.string().max(200).default(''),
  authorName: z.string().max(100).optional(),
  paragraphs,
});

const axis = z.object({
  poleLabel: z.string(),
  stance: z.enum(['critique', 'advocate', 'neutral']),
  keywords: z.array(z.string()),
  coreAttributes: z.array(z.string()),
  paragraphs: z.array(z.number().int()),
});

export const LogicDiagramDataSchema = z.object({
  passageTitle: z.string(),
  authorName: z.string(),
  centralQuestion: z.string(),
  axisA: axis,
  axisB: axis,
  dimensions: z.array(z.object({ dimensionName: z.string(), axisAValue: z.string(), axisBValue: z.string() })),
  synthesisThesis: z.string(),
  logicTree: z.array(
    z.object({
      id: z.string(),
      paragraphNumbers: z.array(z.number().int()),
      role: z.enum(['problem_statement', 'antithesis', 'turning_point', 'thesis', 'elaboration']),
      roleLabel: z.string(),
      summary: z.string(),
      logicalMarkerUsed: z
        .string()
        .nullish()
        .transform((v) => v ?? undefined),
      nextNodeIds: z.array(z.string()),
    }),
  ),
});
