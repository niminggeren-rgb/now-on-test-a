'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpenText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, findNavItem } from './nav-items';

export function AppSidebar() {
  const pathname = usePathname();
  const active = findNavItem(pathname);

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-surface md:flex print:hidden">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <BookOpenText className="h-4 w-4 text-accent" aria-hidden />
        <span className="text-sm font-semibold tracking-tight">Logical Vernacular</span>
      </div>
      <nav aria-label="メインナビゲーション" className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive = active?.href === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent/15 text-foreground'
                  : 'text-muted hover:bg-foreground/5 hover:text-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4', isActive && 'text-accent')} aria-hidden />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 text-xs text-muted">
        <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">?</kbd>
        <span className="ml-2">ショートカット一覧</span>
      </div>
    </aside>
  );
}
