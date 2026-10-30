'use client';

import { useEffect, useState } from 'react';

export interface AiStatus {
  gemini: boolean;
  geminiKeySource: string | null;
  nvidia: boolean;
  nvidiaKeySource: string | null;
  nvidiaModel: string | null;
  nvidiaBaseUrl: string | null;
  supabase: boolean;
  appMode: string;
  deployEnv: string;
}

/**
 * サーバーに問い合わせた AI 接続状態。確認中・確認失敗は null（その間は操作をブロックしない）。
 * クライアントの process.env にサーバー用のキーは入らないため、必ず /api/ai/status を経由する。
 */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/ai/status', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<AiStatus>) : null))
      .then((data) => active && setStatus(data))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return status;
}

export function isAiAvailable(status: AiStatus | null): boolean {
  if (!status) return true; // 確認中はブロックしない
  return status.gemini || status.nvidia;
}

export function aiProviderLabel(status: AiStatus | null): string {
  if (!status) return '確認中';
  if (status.gemini && status.nvidia) return 'Gemini + Nvidia';
  if (status.gemini) return 'Gemini';
  if (status.nvidia) return `Nvidia (${status.nvidiaModel ?? 'nemotron'})`;
  return '未設定';
}
