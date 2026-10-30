import OpenAI from 'openai';

export const NVIDIA_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const NVIDIA_DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';

/** 受け付ける環境変数名（先頭が優先） */
export const NVIDIA_KEY_ENV_NAMES = ['NVIDIA_API_KEY', 'NVDA_API_KEY', 'NVIDIA_APIKEY'] as const;
export const NVIDIA_BASE_URL_ENV_NAMES = ['NVIDIA_BASE_URL', 'NVIDIA_API_BASE_URL'] as const;
export const NVIDIA_MODEL_ENV_NAMES = ['NVIDIA_MODEL', 'NVIDIA_API_MODEL'] as const;

function cleanKey(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
}

function cleanValue(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
}

/** 有効なキーとその変数名。未設定、またはサンプル値（your-…）のままなら null */
export function resolveNvidiaKey(
  env: Record<string, string | undefined> = process.env,
): { apiKey: string; source: string } | null {
  for (const name of NVIDIA_KEY_ENV_NAMES) {
    const apiKey = cleanKey(env[name]);
    if (apiKey && !apiKey.startsWith('your-')) return { apiKey, source: name };
  }
  return null;
}

export function resolveNvidiaBaseUrl(env: Record<string, string | undefined> = process.env): string {
  for (const name of NVIDIA_BASE_URL_ENV_NAMES) {
    const v = cleanValue(env[name]);
    if (v) return v.replace(/\/$/, '');
  }
  return NVIDIA_DEFAULT_BASE_URL;
}

export function resolveNvidiaModel(env: Record<string, string | undefined> = process.env): string {
  for (const name of NVIDIA_MODEL_ENV_NAMES) {
    const v = cleanValue(env[name]);
    if (v) return v;
  }
  return NVIDIA_DEFAULT_MODEL;
}

export const NVIDIA_MODELS = {
  get defaultModel(): string {
    return resolveNvidiaModel();
  },
  get vision(): string {
    return resolveNvidiaModel();
  },
};

/**
 * サーバー専用。キーが未設定の場合は null を返し、
 * 呼び出し元は 503 + 案内メッセージを返す。
 */
export function getNvidiaClient(): OpenAI | null {
  const key = resolveNvidiaKey();
  if (!key) return null;
  const baseURL = resolveNvidiaBaseUrl();
  return new OpenAI({
    baseURL,
    apiKey: key.apiKey,
  });
}

/**
 * Nvidia API のエラーを、画面とログに出せる短い説明にする（APIキーは伏せる）
 */
export function describeNvidiaError(err: unknown): string {
  const status = (err as { status?: unknown; statusCode?: unknown } | null)?.status ??
    (err as { statusCode?: unknown } | null)?.statusCode;
  const raw = err instanceof Error ? err.message : String(err);
  // Nvidiaキーは nvapi-... 形式。ログに出さない
  const message = raw.replace(/nvapi-[0-9A-Za-z_-]{20,}/g, '***').slice(0, 500);
  return `Nvidia API呼び出しエラー${typeof status === 'number' ? ` (HTTP ${status})` : ''}: ${message}`;
}

/** Pythonコードと同等の呼び出しをTypeScriptで再現するための型ヘルパー */
export type NvidiaChatMessageContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type NvidiaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | NvidiaChatMessageContent[];
};

export type NvidiaChatOptions = {
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  seed?: number;
  stream?: boolean;
  parallel_tool_calls?: boolean;
  extra_body?: {
    chat_template_kwargs?: { enable_thinking?: boolean };
    [k: string]: unknown;
  };
};
