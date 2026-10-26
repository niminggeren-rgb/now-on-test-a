'use client';

import { createPortal } from 'react-dom';
import { useMediaQuery } from '@/hooks/use-media-query';
import { ACTIVE_TRAP_TYPES } from '@/lib/scoring';
import { cn } from '@/lib/utils';
import { TRAP_METADATA_MAP, type ActiveTrapType } from '@/types/domain';

interface TrapSelectorProps {
  selected: ActiveTrapType | null;
  onPick: (trap: ActiveTrapType | null) => void;
  onClose: () => void;
}

/**
 * 「なぜ誤りか？」を6種のトラップから選ぶ。
 * - md 以上: 選択肢カード右上のポップオーバー（数字キー 1〜6 で確定、0 で解除、Esc で閉じる）
 * - md 未満: 画面下部からせり上がるボトムシート。カードや本文に重ならないよう、body 直下へポータル描画する
 *   （カードは scale アニメーションで transform を持つため、fixed 配置をカード内に置くと基準がずれる）。
 */
export function TrapSelector({ selected, onPick, onClose }: TrapSelectorProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (isMobile) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden data-testid="trap-sheet-backdrop" />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="トラップ種別を選択"
          data-testid="trap-sheet"
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-foreground/20" aria-hidden />
          <p className="mb-3 text-sm font-semibold">なぜ誤りか？ トラップの種類を選ぶ</p>
          <ul className="grid grid-cols-2 gap-2">
            {ACTIVE_TRAP_TYPES.map((type) => {
              const meta = TRAP_METADATA_MAP[type];
              return (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => onPick(type)}
                    aria-pressed={selected === type}
                    className={cn(
                      'flex min-h-14 w-full flex-col items-start justify-center rounded-lg border px-3 py-2 text-left active:bg-foreground/10',
                      selected === type ? meta.badgeColorClass : 'border-border',
                    )}
                  >
                    <span className="text-sm font-medium">{meta.shortLabel}</span>
                    <span className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{meta.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onPick(null)} className="h-11 rounded-lg border text-sm text-muted active:bg-foreground/10">
              タグ解除
            </button>
            <button type="button" onClick={onClose} className="h-11 rounded-lg border text-sm active:bg-foreground/10">
              閉じる
            </button>
          </div>
        </div>
      </>,
      document.body,
    );
  }

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
