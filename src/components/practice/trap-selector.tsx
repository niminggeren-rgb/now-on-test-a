'use client';

import { ACTIVE_TRAP_TYPES } from '@/lib/scoring';
import { cn } from '@/lib/utils';
import { TRAP_METADATA_MAP, type ActiveTrapType } from '@/types/domain';

interface TrapSelectorProps {
  selected: ActiveTrapType | null;
  onPick: (trap: ActiveTrapType | null) => void;
  onClose: () => void;
}

/** 「なぜ誤りか？」を6種のトラップから選ぶポップオーバー。数字キー 1〜6 で確定、0 で解除、Esc で閉じる。 */
export function TrapSelector({ selected, onPick, onClose }: TrapSelectorProps) {
  return (
    <div
      role="dialog"
      aria-label="トラップ種別を選択"
      className="absolute right-2 top-10 z-20 w-64 rounded-lg border bg-surface p-2 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="px-1.5 pb-1.5 text-[11px] text-muted">なぜ誤りか？ 数字キーで即確定</p>
      <ul className="space-y-1">
        {ACTIVE_TRAP_TYPES.map((type) => {
          const meta = TRAP_METADATA_MAP[type];
          return (
            <li key={type}>
              <button
                type="button"
                onClick={() => onPick(type)}
                aria-pressed={selected === type}
                title={meta.checkPoint}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-foreground/5',
                  selected === type ? meta.badgeColorClass : 'border-transparent',
                )}
              >
                <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">{meta.keyNumber}</kbd>
                <span className="font-medium">{meta.shortLabel}</span>
                <span className="truncate text-muted">{meta.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-1.5 flex justify-between px-1">
        <button type="button" onClick={() => onPick(null)} className="text-[11px] text-muted hover:text-foreground">
          <kbd className="mr-1 rounded border bg-background px-1 font-mono">0</kbd>タグ解除
        </button>
        <button type="button" onClick={onClose} className="text-[11px] text-muted hover:text-foreground">
          <kbd className="mr-1 rounded border bg-background px-1 font-mono">Esc</kbd>閉じる
        </button>
      </div>
    </div>
  );
}
