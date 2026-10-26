'use client';

import { usePathname } from 'next/navigation';
import { Database, HardDrive } from 'lucide-react';
import { findNavItem } from './nav-items';

export function TopBar({ connected }: { connected: boolean }) {
  const pathname = usePathname();
  const current = findNavItem(pathname);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-surface/80 px-4 backdrop-blur print:hidden">
      <div className="flex items-baseline gap-2">
        <h1 className="text-sm font-semibold">{current?.label ?? 'Logical Vernacular'}</h1>
        {current && <span className="text-xs text-muted">{current.description}</span>}
      </div>
      <div
        className="flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] text-muted"
        title={connected ? 'Supabase に接続中' : 'Supabase 未接続: モックデータで動作します'}
      >
        {connected ? <Database className="h-3 w-3" aria-hidden /> : <HardDrive className="h-3 w-3" aria-hidden />}
        {connected ? 'supabase' : 'hybrid (local)'}
      </div>
    </header>
  );
}
