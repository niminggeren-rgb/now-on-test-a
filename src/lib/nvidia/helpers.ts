import type OpenAI from 'openai';
import { describeNvidiaError, resolveNvidiaModel } from './client';

const DEFAULT_TIMEOUT = 100_000;

export function toDataUrl(mimeType: string, base64: string): string {
  return `data:${mimeType};base64,${base64}`;
}

export function extractNvidiaText(completion: unknown): string | undefined {
  const c = completion as { choices?: Array<{ message?: { content?: string } }> };
  return c.choices?.[0]?.message?.content ?? undefined;
}

export function parseJsonFromText<T>(text: string | undefined, validator?: (json: unknown) => T | null): T | null {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    if (validator) return validator(parsed);
    return parsed as T;
  } catch {
    return null;
  }
}

export async function callNvidiaJson(
  client: OpenAI,
  systemPrompt: string,
  userContent: string | OpenAI.Chat.Completions.ChatCompletionContentPart[],
  options: { temperature?: number; max_tokens?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: Array.isArray(userContent) ? userContent : userContent } as OpenAI.Chat.Completions.ChatCompletionMessageParam,
    ];
    const completion = await client.chat.completions.create(
      {
        model: resolveNvidiaModel(),
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.max_tokens ?? 8192,
        stream: false,
      } as never,
      { signal: controller.signal } as never,
    );
    return extractNvidiaText(completion) ?? null;
  } catch (e) {
    console.error('[nvidia/helpers] error:', describeNvidiaError(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function callNvidiaJsonWithImages(
  client: OpenAI,
  systemPrompt: string,
  textPrompt: string,
  images: readonly { mimeType: string; data: string }[],
  options: { temperature?: number; max_tokens?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    ...images.map(
      (img) =>
        ({
          type: 'image_url' as const,
          image_url: { url: toDataUrl(img.mimeType, img.data) },
        }) as OpenAI.Chat.Completions.ChatCompletionContentPart,
    ),
    { type: 'text' as const, text: textPrompt },
  ];
  return callNvidiaJson(client, systemPrompt, parts, options);
}
