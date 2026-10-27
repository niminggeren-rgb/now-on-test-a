import type { NextRequest } from 'next/server';
import { buildSocratesSystemInstruction, inferTargetProtocolStep } from '@/lib/ai/prompts/protocolPrompts';
import { MentorChatRequestSchema } from '@/lib/ai/schemas/protocolSchemas';
import { getGeminiClient, GEMINI_MODELS } from '@/lib/gemini/client';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const rateLimited = createRateLimiter(20);

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error }), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(request: NextRequest) {
  if (rateLimited(clientKey(request.headers))) return jsonError('リクエストが多すぎます。しばらく待ってから再度お試しください。', 429);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError('リクエストの形式が正しくありません', 400);
  }
  const parsed = MentorChatRequestSchema.safeParse(json);
  if (!parsed.success) return jsonError('質問の内容が正しくありません', 400);
  const body = parsed.data;
  if (body.messages[body.messages.length - 1]?.role !== 'user') return jsonError('最後のメッセージは生徒の発言である必要があります', 400);

  const ai = getGeminiClient();
  if (!ai) return jsonError('AIメンターが利用できません（GEMINI_API_KEY が未設定です）。', 503);

  const lastUser = body.messages[body.messages.length - 1]!.content;
  const activeStep = inferTargetProtocolStep(lastUser, body.targetStep);

  let stream: Awaited<ReturnType<typeof ai.models.generateContentStream>>;
  try {
    stream = await ai.models.generateContentStream({
      model: GEMINI_MODELS.fast,
      contents: body.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      config: {
        systemInstruction: buildSocratesSystemInstruction(body, activeStep),
        temperature: 0.35,
        maxOutputTokens: 1024,
      },
    });
  } catch {
    return jsonError('AIメンターとの通信に失敗しました。', 502);
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.text) controller.enqueue(encoder.encode(chunk.text));
        }
      } catch {
        controller.enqueue(encoder.encode('\n（通信が途中で中断されました。もう一度送信してください。）'));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Vernacular-Protocol-Step': activeStep,
    },
  });
}
