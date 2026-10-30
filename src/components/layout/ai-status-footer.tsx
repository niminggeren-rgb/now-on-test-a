'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface AiStatus {
  gemini: boolean;
  nvidia: boolean;
  nvidiaModel: string | null;
  supabase: boolean;
  appMode: string;
}

/** 接続状態は実行時にサーバーへ問い合わせる（ビルド時の環境変数で固定表示しない） */
export function AiStatusFooter() {
  const [status, setStatus] = useState<AiStatus | 'error' | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/ai/status', { cache: 'no-store' })
      .then((res) => res.json() as Promise<AiStatus>)
      .then((data) => active && setStatus(data))
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, []);

  const label =
    status === null
      ? 'checking connection...'
      : status === 'error'
        ? 'status check failed'
        : `mode: ${status.appMode} · supabase: ${status.supabase ? 'connected' : 'not configured (local)'} · gemini: ${
            status.gemini ? 'connected' : 'not configured'
          } · nvidia: ${status.nvidia ? `connected (${status.nvidiaModel ?? 'nemotron'})` : 'not configured'}`;
  const online = typeof status === 'object' && status !== null && (status.gemini || status.nvidia);

  return (
    <p className="flex items-center justify-center gap-2 font-mono text-[11px] text-muted" role="status">
      <span aria-hidden className={cn('inline-block h-1.5 w-1.5 rounded-full', status === null ? 'animate-pulse bg-muted' : online ? 'bg-emerald-400' : 'bg-amber-400')} />
      {label}
    </p>
  );
}
