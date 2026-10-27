import { Type, type GoogleGenAI, type Schema } from '@google/genai';
import { LOGIC_DIAGRAM_PROMPT } from '@/lib/ai/prompts/protocolPrompts';
import { LogicDiagramDataSchema } from '@/lib/ai/schemas/protocolSchemas';
import { GEMINI_MODELS } from '@/lib/gemini/client';
import type { LogicDiagramData } from '@/types/protocol';

const TIMEOUT_MS = 50_000;

const str: Schema = { type: Type.STRING };
const int: Schema = { type: Type.INTEGER };
const strArray: Schema = { type: Type.ARRAY, items: str };
const intArray: Schema = { type: Type.ARRAY, items: int };
const obj = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({
  type: Type.OBJECT,
  properties,
  required,
});

const axis = obj({
  poleLabel: str,
  stance: { type: Type.STRING, enum: ['critique', 'advocate', 'neutral'] },
  keywords: strArray,
  coreAttributes: strArray,
  paragraphs: intArray,
});

const LOGIC_DIAGRAM_SCHEMA: Schema = obj({
  passageTitle: str,
  authorName: str,
  centralQuestion: str,
  axisA: axis,
  axisB: axis,
  dimensions: { type: Type.ARRAY, items: obj({ dimensionName: str, axisAValue: str, axisBValue: str }) },
  synthesisThesis: str,
  logicTree: {
    type: Type.ARRAY,
    items: obj(
      {
        id: str,
        paragraphNumbers: intArray,
        role: { type: Type.STRING, enum: ['problem_statement', 'antithesis', 'turning_point', 'thesis', 'elaboration'] },
        roleLabel: str,
        summary: str,
        logicalMarkerUsed: { type: Type.STRING, nullable: true },
        nextNodeIds: strArray,
      },
      ['id', 'paragraphNumbers', 'role', 'roleLabel', 'summary', 'nextNodeIds'],
    ),
  },
});

/** 評論文から Step 1（二項対立・論理ツリー）を抽出する。失敗時は null。 */
export async function generateLogicDiagram(
  ai: GoogleGenAI,
  input: { passageTitle: string; authorName?: string; paragraphs: readonly string[] },
): Promise<LogicDiagramData | null> {
  const numbered = input.paragraphs.map((p, i) => `【第${i + 1}段落】\n${p}`).join('\n\n');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await ai.models.generateContent({
      model: GEMINI_MODELS.fast,
      contents: [{ role: 'user', parts: [{ text: `タイトル: ${input.passageTitle || '無題'}\n著者: ${input.authorName ?? '不明'}\n\n本文:\n${numbered}` }] }],
      config: {
        systemInstruction: LOGIC_DIAGRAM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: LOGIC_DIAGRAM_SCHEMA,
        temperature: 0.2,
        abortSignal: controller.signal,
      },
    });
    const parsed = LogicDiagramDataSchema.safeParse(JSON.parse((res.text ?? '').trim()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
