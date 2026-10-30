import type OpenAI from 'openai';
import { LOGIC_DIAGRAM_PROMPT } from '@/lib/ai/prompts/protocolPrompts';
import { LogicDiagramDataSchema } from '@/lib/ai/schemas/protocolSchemas';
import type { LogicDiagramData } from '@/types/protocol';
import { describeNvidiaError } from './client';
import { callNvidiaJson } from './helpers';

export async function generateLogicDiagramWithNvidia(
  client: OpenAI,
  input: { passageTitle: string; authorName?: string; paragraphs: readonly string[] },
): Promise<LogicDiagramData | null> {
  const numbered = input.paragraphs.map((p, i) => `【第${i + 1}段落】\n${p}`).join('\n\n');
  const userPrompt = `タイトル: ${input.passageTitle || '無題'}\n著者: ${input.authorName ?? '不明'}\n\n本文:\n${numbered}`;
  try {
    const text = await callNvidiaJson(client, LOGIC_DIAGRAM_PROMPT, userPrompt, { temperature: 0.2 });
    if (!text) return null;
    const parsed = LogicDiagramDataSchema.safeParse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')));
    return parsed.success ? parsed.data : null;
  } catch (e) {
    console.error('[nvidia/logic-diagram] error:', describeNvidiaError(e));
    return null;
  }
}
