import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { describeNvidiaError, getNvidiaClient, resolveNvidiaModel } from '@/lib/nvidia/client';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import type { ActionResult } from '@/types/action';

export const runtime = 'nodejs';
export const maxDuration = 60;

const rateLimited = createRateLimiter(10);

/**
 * シンプルな Vision デモエンドポイント
 * ユーザーのPythonコードをそのまま再現:
 *
 *   messages=[{"role": "user", "content": [
 *     {"type": "text", "text": "Read the traffic sign..."},
 *     {"type": "image_url", "image_url": {"url": "https://..."}}
 *   ]}]
 *
 * POST { imageUrl, prompt? } で呼び出すと、NvidiaのVisionモデルが画像を読み取って回答する
 */

const bodySchema = z.object({
  imageUrl: z.string().url().max(8000),
  prompt: z.string().max(2000).optional(),
  model: z.string().min(1).max(200).optional(),
  stream: z.boolean().optional(),
});

function fail(error: string, status: number) {
  const body: ActionResult<never> = { success: false, error };
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  if (rateLimited(clientKey(request.headers))) {
    return fail('リクエストが多すぎます。しばらく待ってから再度お試しください。', 429);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail('リクエストの形式が正しくありません', 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail('imageUrl を正しく指定してください', 400);
  }

  const { imageUrl, prompt, model, stream } = parsed.data;
  const text =
    prompt ?? 'Read the traffic sign in this image. What does it say, and what color is the sign?';

  const client = getNvidiaClient();
  if (!client) {
    return fail(
      'NVIDIA_API_KEY が未設定です。.env.local に NVIDIA_API_KEY=nvapi-... を設定してください。取得先: https://build.nvidia.com/',
      503,
    );
  }

  const useModel = model ?? resolveNvidiaModel();

  // ストリーミングはSSEで返す
  if (stream) {
    try {
      const completion = await client.chat.completions.create({
        model: useModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ] as never,
        temperature: 1,
        top_p: 0.95,
        max_tokens: 16384,
        parallel_tool_calls: true,
        seed: 42,
        extra_body: { chat_template_kwargs: { enable_thinking: true } },
        stream: true,
      } as never);

      const encoder = new TextEncoder();
      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of completion as unknown as AsyncIterable<{
              choices?: Array<{ delta?: { content?: string | null; reasoning_content?: string | null } }>;
            }>) {
              if (!chunk.choices?.length) continue;
              const delta = chunk.choices[0]?.delta;
              const reasoning = (delta as { reasoning_content?: string | null })?.reasoning_content;
              if (reasoning) controller.enqueue(encoder.encode(reasoning));
              if (delta?.content) controller.enqueue(encoder.encode(delta.content));
            }
          } catch (e) {
            controller.enqueue(encoder.encode(`\n[Error: ${describeNvidiaError(e)}]`));
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    } catch (err) {
      return fail(describeNvidiaError(err), 502);
    }
  }

  // 非ストリーミング: 完了まで待ってJSONで返す
  try {
    const completion = await client.chat.completions.create({
      model: useModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ] as never,
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      parallel_tool_calls: true,
      seed: 42,
      extra_body: { chat_template_kwargs: { enable_thinking: true } },
      stream: false,
    } as never);

    const choice = (completion as unknown as { choices: Array<{ message: { content: string } }> }).choices[0];
    const textOut = choice?.message?.content ?? '';

    const body: ActionResult<{ text: string; model: string; raw: unknown }> = {
      success: true,
      data: { text: textOut, model: useModel, raw: completion },
    };
    return NextResponse.json(body);
  } catch (err) {
    return fail(describeNvidiaError(err), 502);
  }
}

export async function GET() {
  return NextResponse.json({
    usage: 'POST /api/ai/nvidia-vision',
    example: {
      imageUrl: 'https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg',
      prompt: 'Read the traffic sign in this image. What does it say, and what color is the sign?',
      stream: false,
    },
    note: 'prompt省略時は上記デフォルト質問が使われます。stream:true でストリーミング（text/plain）',
  });
}
