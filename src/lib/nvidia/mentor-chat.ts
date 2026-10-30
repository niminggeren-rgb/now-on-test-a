import type OpenAI from 'openai';
import { buildSocratesSystemInstruction, inferTargetProtocolStep } from '@/lib/ai/prompts/protocolPrompts';
import type { MentorChatRequest } from '@/lib/ai/schemas/protocolSchemas';
import { describeNvidiaError, resolveNvidiaModel } from './client';

export async function streamMentorChatWithNvidia(
  client: OpenAI,
  body: MentorChatRequest,
): Promise<ReadableStream<Uint8Array> | { error: string }> {
  const lastUser = body.messages[body.messages.length - 1]!.content;
  const activeStep = inferTargetProtocolStep(lastUser, body.targetStep);
  const systemInstruction = buildSocratesSystemInstruction(body, activeStep);

  try {
    const stream = await client.chat.completions.create(
      {
        model: resolveNvidiaModel(),
        messages: [
          { role: 'system', content: systemInstruction },
          ...body.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        ],
        temperature: 0.35,
        max_tokens: 1024,
        stream: true,
      } as never,
    );

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream as unknown as AsyncIterable<{ choices?: Array<{ delta?: { content?: string } }> }>) {
            const text = chunk.choices?.[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch {
          controller.enqueue(encoder.encode('\n（通信が途中で中断されました。もう一度送信してください。）'));
        }
        controller.close();
      },
    });
    return readable;
  } catch (e) {
    return { error: describeNvidiaError(e) };
  }
}
