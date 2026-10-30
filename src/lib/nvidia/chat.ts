import type OpenAI from 'openai';
import { describeNvidiaError, getNvidiaClient, resolveNvidiaModel } from './client';
import type { NvidiaChatMessage, NvidiaChatOptions } from './client';

/**
 * Nvidia API (OpenAI互換) でチャット補完を実行する。
 * Pythonの openai.OpenAI(base_url="https://integrate.api.nvidia.com/v1") と同等。
 *
 * Vision対応: content に { type: 'image_url', image_url: { url } } を含められる
 */
export async function createNvidiaChatCompletion(
  client: OpenAI,
  messages: NvidiaChatMessage[],
  options: NvidiaChatOptions = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const model = options.model ?? resolveNvidiaModel();
  // openai SDKの型では extra_body は unknown として渡す
  const extra = options.extra_body as Record<string, unknown> | undefined;

  const res = await client.chat.completions.create({
    model,
    messages: messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: options.temperature ?? 1,
    top_p: options.top_p ?? 0.95,
    max_tokens: options.max_tokens ?? 16384,
    seed: options.seed ?? 42,
    stream: false,
    ...(extra ? { extra_body: extra } : {}),
    ...(options.parallel_tool_calls !== undefined ? { parallel_tool_calls: options.parallel_tool_calls } : {}),
  } as never);

  return res as unknown as OpenAI.Chat.Completions.ChatCompletion;
}

/**
 * ストリーミング版。Pythonの for chunk in completion: ... と同等。
 * reasoning_content (Nemotronの思考過程) も含めて扱う。
 */
export async function streamNvidiaChatCompletion(
  client: OpenAI,
  messages: NvidiaChatMessage[],
  options: NvidiaChatOptions = {},
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const model = options.model ?? resolveNvidiaModel();
  const extra = options.extra_body as Record<string, unknown> | undefined;

  const stream = await client.chat.completions.create({
    model,
    messages: messages as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    temperature: options.temperature ?? 1,
    top_p: options.top_p ?? 0.95,
    max_tokens: options.max_tokens ?? 16384,
    seed: options.seed ?? 42,
    stream: true,
    ...(extra ? { extra_body: extra } : {}),
    ...(options.parallel_tool_calls !== undefined ? { parallel_tool_calls: options.parallel_tool_calls } : {}),
  } as never);

  return stream as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
}

/**
 * フォールバック付き: Nvidia未設定なら null クライアントを検出してエラーメッセージを返す
 */
export function ensureNvidiaClient(): { client: OpenAI } | { error: string } {
  const client = getNvidiaClient();
  if (!client) {
    return {
      error:
        'NVIDIA_API_KEY が未設定です。.env.local に NVIDIA_API_KEY=nvapi-... を設定してください。取得先: https://build.nvidia.com/ または https://integrate.api.nvidia.com/ でAPIキーを発行',
    };
  }
  return { client };
}

export { describeNvidiaError };
