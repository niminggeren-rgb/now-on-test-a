/**
 * Nvidia API 使用例（TypeScript版）
 * 元のPythonコード:
 *
 *   import os
 *   from openai import OpenAI
 *   client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=os.environ["NVIDIA_API_KEY"])
 *   completion = client.chat.completions.create(
 *     model="nvidia/nemotron-3.5-super-vl-120b-a12b",
 *     messages=[{"role": "user", "content": [{"type": "text", "text": "Read the traffic sign..."}, {"type": "image_url", "image_url": {"url": "https://..."}}]}],
 *     temperature=1, top_p=0.95, max_tokens=16384, parallel_tool_calls=True, seed=42,
 *     extra_body={"chat_template_kwargs": {"enable_thinking": True}}, stream=True
 *   )
 *   for chunk in completion:
 *     if not chunk.choices: continue
 *     reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
 *     if reasoning: print(reasoning, end="")
 *     if chunk.choices[0].delta.content is not None: print(chunk.choices[0].delta.content, end="")
 *
 * 実行方法:
 *   1. .env.local に NVIDIA_API_KEY=nvapi-... を設定（または環境変数で export NVIDIA_API_KEY=nvapi-...）
 *   2. npx tsx scripts/nvidia-example.ts
 *   3. ストリーミングせずに1回で受けたい場合は STREAM=false npx tsx scripts/nvidia-example.ts
 *
 * Next.jsアプリ内から呼ぶ場合: POST /api/ai/nvidia-chat または POST /api/ai/nvidia-vision を使うと
 * クライアントにAPIキーを露出せずに済む。詳細は GET /api/ai/nvidia-chat を参照。
 */

import OpenAI from 'openai';

// 環境変数から直接読む（Next.js外のスクリプト用）
// .env.local がある場合は tsx が自動で読まないので、必要なら dotenv を使う
const apiKey = process.env.NVIDIA_API_KEY?.trim();
if (!apiKey) {
  console.error('NVIDIA_API_KEY が未設定です。');
  console.error('  export NVIDIA_API_KEY=nvapi-...');
  console.error('  または .env.local に NVIDIA_API_KEY=nvapi-... を記載');
  console.error('  取得先: https://build.nvidia.com/ で対象モデルを開き "Get API Key" から発行');
  process.exit(1);
}

const baseURL = process.env.NVIDIA_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1';
const model = process.env.NVIDIA_MODEL?.trim() || 'nvidia/nemotron-3.5-super-vl-120b-a12b';
const doStream = process.env.STREAM !== 'false';

const client = new OpenAI({ baseURL, apiKey });

const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Read the traffic sign in this image. What does it say, and what color is the sign?',
      },
      {
        type: 'image_url',
        image_url: {
          url: 'https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1a.jpg',
        },
      },
    ],
  },
];

async function runStreaming() {
  console.log(`[Nvidia] model=${model} baseURL=${baseURL} stream=true`);
  console.log('--- reasoning + content (streaming) ---');

  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    parallel_tool_calls: true,
    seed: 42,
    extra_body: { chat_template_kwargs: { enable_thinking: true } },
    stream: true,
  } as never);

  for await (const chunk of completion as unknown as AsyncIterable<{ choices?: Array<{ delta?: { content?: string | null; reasoning_content?: string | null } }> }>) {
    const c = chunk as { choices?: Array<{ delta?: { content?: string | null; reasoning_content?: string | null } }> };
    if (!c.choices?.length) continue;
    const delta = c.choices[0]!.delta as unknown as { content?: string | null; reasoning_content?: string | null };
    if (delta.reasoning_content) process.stdout.write(delta.reasoning_content);
    if (delta.content) process.stdout.write(delta.content);
  }
  console.log('\n--- done ---');
}

async function runOnce() {
  console.log(`[Nvidia] model=${model} baseURL=${baseURL} stream=false`);
  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    parallel_tool_calls: true,
    seed: 42,
    extra_body: { chat_template_kwargs: { enable_thinking: true } },
    stream: false,
  } as never);

  const msg = (completion as unknown as { choices: Array<{ message: { content: string } }> }).choices[0]?.message;
  console.log('--- response ---');
  console.log(msg?.content ?? '(empty)');
}

if (doStream) await runStreaming();
else await runOnce();
