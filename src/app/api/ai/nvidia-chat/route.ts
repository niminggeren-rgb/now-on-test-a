import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { describeNvidiaError, getNvidiaClient, resolveNvidiaModel } from '@/lib/nvidia/client';
import { clientKey, createRateLimiter } from '@/lib/rate-limit';
import type { ActionResult } from '@/types/action';

export const runtime = 'nodejs';
export const maxDuration = 120;

const rateLimited = createRateLimiter(20);

/**
 * OpenAI互換のチャット補完エンドポイント（Nvidia経由）
 *
 * Pythonコードと同等のリクエストを TypeScript/Next.js から送れるようにするプロキシ:
 *
 *   import OpenAI from 'openai'
 *   const client = new OpenAI({ baseURL: "https://integrate.api.nvidia.com/v1", apiKey: process.env.NVIDIA_API_KEY })
 *   client.chat.completions.create({ model: "nvidia/nemotron-3.5-super-vl-120b-a12b", ... })
 *
 * このAPIは同じことをサーバー側で実行し、クライアントにAPIキーを露出させずに済む。
 */

const contentPartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image_url'), image_url: z.object({ url: z.string().min(1).max(80000) }) }),
]);

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.union([z.string(), z.array(contentPartSchema)]),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  model: z.string().min(1).max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(1).max(32768).optional(),
  seed: z.number().int().optional(),
  stream: z.boolean().optional(),
  parallel_tool_calls: z.boolean().optional(),
  extra_body: z
    .object({ chat_template_kwargs: z.object({ enable_thinking: z.boolean() }).optional() })
    .passthrough()
    .optional(),
});

function fail(error: string, status: number, details?: unknown) {
  const body: ActionResult<never> = { success: false, error };
  return NextResponse.json(
    details ? { ...body, details } : body,
    { status },
  );
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
    return fail('入力内容が正しくありません', 400, parsed.error.flatten());
  }

  const {
    messages,
    model,
    temperature,
    top_p,
    max_tokens,
    seed,
    stream,
    parallel_tool_calls,
    extra_body,
  } = parsed.data;

  const client = getNvidiaClient();
  if (!client) {
    return fail(
      'NVIDIA_API_KEY が未設定です。.env.local に NVIDIA_API_KEY=nvapi-... を設定してください。取得先: https://build.nvidia.com/',
      503,
    );
  }

  const useModel = model ?? resolveNvidiaModel();

  // ストリーミング: Server-Sent Events で返す
  if (stream) {
    try {
      const extraBody = extra_body ?? { chat_template_kwargs: { enable_thinking: true } };
      const completion = await client.chat.completions.create({
        model: useModel,
        messages: messages as never,
        temperature: temperature ?? 1,
        top_p: top_p ?? 0.95,
        max_tokens: max_tokens ?? 16384,
        seed: seed ?? 42,
        parallel_tool_calls: parallel_tool_calls ?? true,
        stream: true,
        extra_body: extraBody,
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
              // reasoning_content (Nemotronの思考過程) と content を分けて送る
              const reasoning = (delta as { reasoning_content?: string | null })?.reasoning_content;
              if (reasoning) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'reasoning', content: reasoning })}\n\n`),
                );
              }
              if (delta?.content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'content', content: delta.content })}\n\n`),
                );
              }
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch (e) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'error', error: describeNvidiaError(e) })}\n\n`),
            );
          }
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    } catch (err) {
      return fail(describeNvidiaError(err), 502);
    }
  }

  // 非ストリーミング: JSONで返す
  try {
    const extraBody = extra_body ?? { chat_template_kwargs: { enable_thinking: true } };
    const completion = await client.chat.completions.create({
      model: useModel,
      messages: messages as never,
      temperature: temperature ?? 1,
      top_p: top_p ?? 0.95,
      max_tokens: max_tokens ?? 16384,
      seed: seed ?? 42,
      parallel_tool_calls: parallel_tool_calls ?? true,
      stream: false,
      extra_body: extraBody,
    } as never);

    const body: ActionResult<typeof completion> = { success: true, data: completion as never };
    return NextResponse.json(body);
  } catch (err) {
    return fail(describeNvidiaError(err), 502);
  }
}

// GETで使い方を案内（開発者向け）
export async function GET() {
  return NextResponse.json({
    usage: 'POST /api/ai/nvidia-chat で Nvidia API (OpenAI互換) を呼び出せます',
    example: {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Read the traffic sign in this image. What does it say, and what color is the sign?' },
            {
              type: 'image_url',
              image_url: { url: 'https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg' },
            },
          ],
        },
      ],
      model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      stream: true,
      extra_body: { chat_template_kwargs: { enable_thinking: true } },
    },
    env: {
      required: 'NVIDIA_API_KEY=nvapi-... を .env.local に設定',
      optional: 'NVIDIA_MODEL / NVIDIA_BASE_URL で上書き可能（デフォルトは https://integrate.api.nvidia.com/v1）',
      statusEndpoint: 'GET /api/ai/status で nvidia: true/false を確認',
    },
    python_original: `
import os
from openai import OpenAI
client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=os.environ["NVIDIA_API_KEY"])
completion = client.chat.completions.create(
  model="nvidia/nemotron-3.5-super-vl-120b-a12b",
  messages=[{"role": "user", "content": [{"type": "text", "text": "Read the traffic sign..."}, {"type": "image_url", "image_url": {"url": "https://..."}}]}],
  temperature=1, top_p=0.95, max_tokens=16384, parallel_tool_calls=True, seed=42,
  extra_body={"chat_template_kwargs": {"enable_thinking": True}}, stream=True
)
for chunk in completion:
  if not chunk.choices: continue
  reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
  if reasoning: print(reasoning, end="")
  if chunk.choices[0].delta.content is not None: print(chunk.choices[0].delta.content, end="")
`,
  });
}
