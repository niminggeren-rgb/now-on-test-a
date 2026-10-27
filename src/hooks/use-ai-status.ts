'use client';

import { useEffect, useState } from 'react';

export interface AiStatus {
  gemini: boolean;
  geminiKeySource: string | null;
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
