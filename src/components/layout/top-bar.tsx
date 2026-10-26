'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Database, HardDrive, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findNavItem, NAV_ITEMS } from './nav-items';

export function TopBar({ connected }: { connected: boolean }) {
  const pathname = usePathname();
  const current = findNavItem(pathname);
  const [menuOpen, setMenuOpen] = useState(false);

  // ページ遷移したらメニューを閉じる
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-surface/80 px-3 backdrop-blur md:px-4 print:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-muted active:bg-foreground/10 md:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
        <h1 className="truncate text-sm font-semibold">{current?.label ?? 'Logical Vernacular'}</h1>
        {current && <span className="hidden text-xs text-muted sm:inline">{current.description}</span>}
      </div>
      <div
        className="flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] text-muted"
        title={connected ? 'Supabase に接続中' : 'Supabase 未接続: ローカルのデータで動作します'}
      >
        {connected ? <Database className="h-3 w-3" aria-hidden /> : <HardDrive className="h-3 w-3" aria-hidden />}
        {connected ? 'supabase' : 'local'}
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 top-12 z-30 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} aria-hidden />
          <nav
            id="mobile-nav"
            aria-label="メインナビゲーション（モバイル）"
            className="absolute inset-x-0 top-full z-40 border-b bg-surface p-2 shadow-xl md:hidden"
          >
            <ul>
              {NAV_ITEMS.map((item) => {
                const active = current?.href === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm',
                        active ? 'bg-accent/15 font-medium' : 'text-muted active:bg-foreground/10',
                      )}
                    >
                      <Icon className={cn('h-4 w-4', active && 'text-accent')} aria-hidden />
                      {item.label}
                      <span className="ml-auto text-xs text-muted">{item.description}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      )}
    </header>
  );
}
