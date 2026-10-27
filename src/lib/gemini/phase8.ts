import { Type, type GoogleGenAI, type Schema } from '@google/genai';
import {
  ON_DEMAND_EXPLANATION_SYSTEM_PROMPT,
  STAGE1_TRIAGE_SYSTEM_PROMPT,
  STAGE2_INK_SEPARATED_OCR_SYSTEM_PROMPT,
} from '@/lib/ai/prompts/phase8Prompts';
import {
  OnDemandExplanationResponseSchema,
  Stage1TriageResponseSchema,
  Stage2InkSeparatedResponseSchema,
  type ExplanationChoice,
  type OnDemandExplanationResponse,
  type OnDemandMode,
  type Stage1TriageResponse,
  type Stage2InkSeparatedResponse,
} from '@/lib/ai/schemas/phase8Schemas';
import { GEMINI_MODELS } from '@/lib/gemini/client';
import { TRAP_METADATA_MAP } from '@/types/domain';

const TRAP_ENUM = Object.keys(TRAP_METADATA_MAP);
const str = { type: Type.STRING };
const int = { type: Type.INTEGER };
const bool = { type: Type.BOOLEAN };
const nullableStr = { type: Type.STRING, nullable: true };
const strArray = { type: Type.ARRAY, items: str };
const obj = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({
  type: Type.OBJECT,
  properties,
  required,
});

const STAGE1_SCHEMA: Schema = obj({
  items: {
    type: Type.ARRAY,
    items: obj(
      {
        imageIndex: int,
        imageId: str,
        category: { type: Type.STRING, enum: ['PASSAGE', 'QUESTIONS', 'MODEL_ANSWER', 'STUDENT_SHEET', 'DIAGRAM_ONLY'] },
        hasHandwriting: bool,
        hasDiagramOrIllustration: bool,
        requiresVisualInspection: bool,
        discardReasonIfFalse: nullableStr,
        extractedRawText: str,
      },
      ['imageIndex', 'imageId', 'category', 'hasHandwriting', 'hasDiagramOrIllustration', 'requiresVisualInspection', 'extractedRawText'],
    ),
  },
});

const STAGE2_SCHEMA: Schema = obj({
  passageTitle: nullableStr,
  passageAuthor: nullableStr,
  consolidatedPassageText: str,
  questions: {
    type: Type.ARRAY,
    items: obj({
      questionNumberLabel: str,
      questionPrompt: str,
      underlinedTargetText: nullableStr,
      studentInitialSelectedOption: { type: Type.INTEGER, nullable: true },
      officialCorrectOption: int,
      blackPencilTraces: {
        type: Type.ARRAY,
        items: obj(
          {
            optionNumber: int,
            isEliminatedBySlash: bool,
            underlinedOrCrossedPhrases: strArray,
            marginMemo: nullableStr,
            inferredStudentTrapReason: { type: Type.STRING, enum: TRAP_ENUM, nullable: true },
          },
          ['optionNumber', 'isEliminatedBySlash', 'underlinedOrCrossedPhrases', 'inferredStudentTrapReason'],
        ),
      },
      redBluePenGrading: obj({
        gradingMark: { type: Type.STRING, enum: ['CORRECT_CIRCLE', 'INCORRECT_CROSS', 'PARTIAL_TRIANGLE', 'NONE'] },
        correctedOptionNumber: { type: Type.INTEGER, nullable: true },
        redPenNotes: strArray,
      }),
      choices: {
        type: Type.ARRAY,
        items: obj({
          optionNumber: int,
          choiceText: str,
          isCorrectAnswer: bool,
          actualTrapTypes: { type: Type.ARRAY, items: { type: Type.STRING, enum: TRAP_ENUM } },
          flawSpan: nullableStr,
          eliminationReason: str,
        }),
      },
    }),
  },
});

const side = obj({ label: str, keywords: strArray, logicSummary: str });
const ON_DEMAND_SCHEMA: Schema = obj({
  mode: { type: Type.STRING, enum: ['BINARY_OPPOSITION_MAP', 'THINKING_PROCESS'] },
  binaryOppositionMap: {
    ...obj({
      coreThesis: str,
      oppositionAxisLabel: str,
      sideA: side,
      sideB: side,
      abstractionToConcreteFlow: {
        type: Type.ARRAY,
        items: obj({
          paragraphRange: str,
          role: { type: Type.STRING, enum: ['PROBLEM_SETTING', 'COMMON_VIEW', 'COUNTER_ARGUMENT', 'CONCRETE_EXAMPLE', 'CONCLUSION'] },
          summary: str,
        }),
      },
    }),
    nullable: true,
  },
  thinkingProcess: {
    ...obj({
      step1DemonstrativeAndTarget: obj({ title: str, targetAnalysis: str, requiredElements: strArray }),
      step2ContrastAndParaphrase: obj({ title: str, quotedEvidenceSentences: strArray, paraphraseEquation: str }),
      step3OptionEliminationOrder: {
        type: Type.ARRAY,
        items: obj({
          rank: int,
          optionNumber: int,
          verdict: { type: Type.STRING, enum: ['ELIMINATE', 'KEEP_AS_CORRECT'] },
          trapType: { type: Type.STRING, enum: TRAP_ENUM, nullable: true },
          flawQuote: nullableStr,
          logicalReason: str,
        }),
      },
    }),
    nullable: true,
  },
});

export interface Phase8Image {
  id: string;
  mimeType: string;
  /** プレフィックスなしの base64 */
  data: string;
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

async function generateJson(
  ai: GoogleGenAI,
  parts: Part[],
  systemInstruction: string,
  responseSchema: Schema,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await ai.models.generateContent({
      model: GEMINI_MODELS.fast,
      contents: [{ role: 'user', parts }],
      config: { systemInstruction, responseMimeType: 'application/json', responseSchema, temperature: 0.1, abortSignal: controller.signal },
    });
    return JSON.parse((res.text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  } finally {
    clearTimeout(timer);
  }
}

/** Stage 1: 全画像を一括で仕分けし、テキストを抽出する */
export async function triageImages(ai: GoogleGenAI, images: readonly Phase8Image[]): Promise<Stage1TriageResponse | null> {
  const parts: Part[] = [{ text: `以下の ${images.length} 枚の画像を順に判定し、分類・図版精読要否・テキスト抽出を行ってください。` }];
  images.forEach((img, i) => {
    parts.push({ text: `--- Image Index: ${i} (imageId: ${img.id}) ---` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  });
  try {
    const parsed = Stage1TriageResponseSchema.safeParse(await generateJson(ai, parts, STAGE1_TRIAGE_SYSTEM_PROMPT, STAGE1_SCHEMA, 40_000));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Stage 2: Stage 1 のテキストと、手書き・図版のある画像だけを渡して鉛筆/赤ペンを分離抽出する */
export async function extractInkSeparated(
  ai: GoogleGenAI,
  textDigest: string,
  retained: readonly Phase8Image[],
): Promise<Stage2InkSeparatedResponse | null> {
  const parts: Part[] = [
    {
      text: `Stage 1 で全画像から抽出したテキスト:\n\n${textDigest}\n\n続けて、手書き筆跡または必須図版を含む ${retained.length} 枚の画像のみを添付します。鉛筆（自力消去）と赤/青ペン（丸付け・復習）を分離し、各設問の選択肢の傷を構造化してください。`,
    },
  ];
  for (const img of retained) {
    parts.push({ text: `--- Retained image (imageId: ${img.id}) ---` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  try {
    const parsed = Stage2InkSeparatedResponseSchema.safeParse(
      await generateJson(ai, parts, STAGE2_INK_SEPARATED_OCR_SYSTEM_PROMPT, STAGE2_SCHEMA, 50_000),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** キャッシュミス時だけ呼ぶオンデマンド解説の生成 */
export async function generateOnDemandExplanation(
  ai: GoogleGenAI,
  input: { mode: OnDemandMode; passageText: string; questionPrompt: string; choices: readonly ExplanationChoice[] },
): Promise<OnDemandExplanationResponse | null> {
  const text = `【要求モード】: ${input.mode}\n\n【問題本文】:\n${input.passageText}\n\n【対象設問】:\n${input.questionPrompt || '（本文全体の論理構造解析）'}\n\n【選択肢データ】:\n${JSON.stringify(input.choices)}`;
  try {
    const parsed = OnDemandExplanationResponseSchema.safeParse(
      await generateJson(ai, [{ text }], ON_DEMAND_EXPLANATION_SYSTEM_PROMPT, ON_DEMAND_SCHEMA, 50_000),
    );
    // 要求モードと異なる側が埋まって返った場合は採用しない
    if (!parsed.success || parsed.data.mode !== input.mode) return null;
    const d = parsed.data;
    if (input.mode === 'BINARY_OPPOSITION_MAP' ? !d.binaryOppositionMap : !d.thinkingProcess) return null;
    return d;
  } catch {
    return null;
  }
}
