'use client';

import { ArrowRight, Check, CheckCheck, Slash, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileActionBarProps {
  answered: boolean;
  isLast: boolean;
  hasCandidate: boolean;
  /** 直近のガイダンスメッセージ（例: 先に選択肢を選んでください） */
  message: string;
  onEliminate: () => void;
  onTrap: () => void;
  onCandidate: () => void;
  onConfirm: () => void;
  onNext: () => void;
}

const btn =
  'flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px] active:bg-foreground/10';

/**
 * タッチ端末（iPhone / iPad）向けの操作バー。キーボードを使えない環境で
 * 「消去 → トラップ指定 → 解答」を親指だけで行えるようにする。
 * フォーカス中（タップで選択した）選択肢が対象。
 */
export function MobileActionBar({
  answered,
  isLast,
  hasCandidate,
  message,
  onEliminate,
  onTrap,
  onCandidate,
  onConfirm,
  onNext,
}: MobileActionBarProps) {
  return (
    <div
      data-testid="mobile-action-bar"
      className="shrink-0 border-t bg-surface px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 mouse:md:hidden"
    >
      {message && (
        <p aria-hidden className="mb-1.5 px-1 text-center text-[11px] text-amber-400">
          {message}
        </p>
      )}
      {answered ? (
        <button
          type="button"
          onClick={onNext}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-white active:opacity-80"
        >
          {isLast ? '結果を見る' : '次の設問へ'}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={onEliminate} className={btn}>
            <Slash className="h-4 w-4" aria-hidden />
            消去
          </button>
          <button type="button" onClick={onTrap} className={btn}>
            <Tag className="h-4 w-4" aria-hidden />
            トラップ
          </button>
          <button type="button" onClick={onCandidate} aria-pressed={hasCandidate} className={cn(btn, hasCandidate && 'border-accent bg-accent/15')}>
            <Check className="h-4 w-4" aria-hidden />
            候補
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!hasCandidate}
            className="flex h-12 flex-[1.3] flex-col items-center justify-center gap-0.5 rounded-lg bg-accent text-[11px] font-medium text-white active:opacity-80 disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4" aria-hidden />
            解答
          </button>
        </div>
      )}
    </div>
  );
}
