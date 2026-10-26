'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clock, Network, Star } from 'lucide-react';
import { formatSeconds, THEME_LABELS, TIER_LABELS } from '@/lib/labels';
import { segmentParagraph, type MarkerKind } from '@/lib/passage-text';
import { cn } from '@/lib/utils';
import type { PassageItem } from '@/types/domain';

export type WritingMode = 'horizontal' | 'vertical';

const MARKER_CLASS: Record<MarkerKind, string> = {
  CONTRAST: 'bg-rose-500/20 text-rose-400',
  SUMMARY: 'bg-sky-500/20 text-sky-400',
  CAUSE: 'bg-amber-500/20 text-amber-400',
};

const MARKER_LEGEND: { kind: MarkerKind; label: string }[] = [
  { kind: 'CONTRAST', label: '逆接' },
  { kind: 'SUMMARY', label: '要約・結論' },
  { kind: 'CAUSE', label: '因果' },
];

interface PassageReaderProps {
  passage: PassageItem;
  activeUnderlineId: string | null;
  writingMode: WritingMode;
  markersOn: boolean;
  onToggleWritingMode: () => void;
  onToggleMarkers: () => void;
  /** 解答確定後に true。本文構造マップを解放する。 */
  structureUnlocked: boolean;
  timerLabel: string;
  timerRunning: boolean;
  /** 表示中か（モバイルのタブで非表示のときは false）。true になった時点で傍線部へスクロールする。 */
  active?: boolean;
}

function Switch({
  checked,
  onClick,
  label,
  keyHint,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
  keyHint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className="flex min-h-9 items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted transition-colors hover:text-foreground mouse:min-h-0"
    >
      <span
        aria-hidden
        className={cn(
          'relative inline-block h-3.5 w-6 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-foreground/20',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all',
            checked ? 'left-3' : 'left-0.5',
          )}
        />
      </span>
      {label}
      <kbd className="hidden rounded border bg-background px-1 font-mono text-[10px] mouse:inline">{keyHint}</kbd>
    </button>
  );
}

export function PassageReader({
  passage,
  activeUnderlineId,
  writingMode,
  markersOn,
  onToggleWritingMode,
  onToggleMarkers,
  structureUnlocked,
  timerLabel,
  timerRunning,
  active = true,
}: PassageReaderProps) {
  const vertical = writingMode === 'vertical';
  const scrollRef = useRef<HTMLDivElement>(null);
  const underlineRefs = useRef(new Map<string, HTMLElement>());
  const [structureOpen, setStructureOpen] = useState(false);

  // 縦書き時: マウスホイールの縦回転を横スクロールへ変換（vertical-rl は scrollLeft が負方向へ進む）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !vertical) return;
    function onWheel(e: WheelEvent) {
      if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft -= e.deltaY;
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [vertical]);

  // 設問切替・書字方向切替時に該当の傍線部へスクロール
  useEffect(() => {
    if (!activeUnderlineId || !active) return;
    const target = underlineRefs.current.get(activeUnderlineId);
    if (!target) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center', inline: 'center' });
  }, [activeUnderlineId, writingMode, passage.id, active]);

  const structure = passage.logicalStructure;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b bg-surface px-3 py-2 md:px-4 md:py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-medium text-accent">
            {THEME_LABELS[passage.theme]}
          </span>
          <span className="text-muted">{TIER_LABELS[passage.targetTier]}</span>
          <span className="flex items-center gap-0.5" role="img" aria-label={`難易度 ${passage.difficultyLevel} / 5`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                aria-hidden
                className={cn(
                  'h-3 w-3',
                  n <= passage.difficultyLevel ? 'fill-amber-400 text-amber-400' : 'text-foreground/20',
                )}
              />
            ))}
          </span>
          <span className="flex items-center gap-1 font-mono text-muted">
            <Clock className="h-3 w-3" aria-hidden />
            目標 {formatSeconds(passage.standardTimeSeconds)}
          </span>
          <span
            className={cn('ml-auto font-mono text-sm tabular-nums', timerRunning ? 'text-foreground' : 'text-muted')}
            aria-label="経過時間"
          >
            {timerLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Switch checked={vertical} onClick={onToggleWritingMode} label={vertical ? '縦書き' : '横書き'} keyHint="V" />
          <Switch checked={markersOn} onClick={onToggleMarkers} label="論理接続詞マーカー" keyHint="M" />
          <button
            type="button"
            disabled={!structureUnlocked}
            onClick={() => setStructureOpen((v) => !v)}
            aria-expanded={structureUnlocked && structureOpen}
            title={structureUnlocked ? undefined : '解答確定後に開けます'}
            className="ml-auto flex min-h-9 items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted transition-colors enabled:hover:text-foreground disabled:opacity-40 mouse:min-h-0"
          >
            <Network className="h-3.5 w-3.5" aria-hidden />
            本文構造マップ
            <ChevronDown
              className={cn('h-3 w-3 transition-transform', structureOpen && structureUnlocked && 'rotate-180')}
              aria-hidden
            />
          </button>
        </div>
        {markersOn && (
          <ul className="flex gap-3 text-[11px] text-muted" aria-label="マーカー凡例">
            {MARKER_LEGEND.map((m) => (
              <li key={m.kind} className="flex items-center gap-1">
                <span className={cn('rounded px-1', MARKER_CLASS[m.kind])}>あ</span>
                {m.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {structureUnlocked && structureOpen && (
        <section className="max-h-64 overflow-y-auto border-b bg-background px-4 py-3 text-xs" aria-label="本文構造マップ">
          <p className="mb-2 leading-relaxed">
            <span className="mr-1.5 font-mono text-muted">主張</span>
            {structure.mainThesis}
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2">
              <div className="font-medium text-rose-400">{structure.contrastAxis.negativePoleTitle}</div>
              <div className="mt-1 text-muted">{structure.contrastAxis.negativePoleKeywords.join(' / ')}</div>
            </div>
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
              <div className="font-medium text-emerald-400">{structure.contrastAxis.positivePoleTitle}</div>
              <div className="mt-1 text-muted">{structure.contrastAxis.positivePoleKeywords.join(' / ')}</div>
            </div>
          </div>
          <ol className="space-y-1">
            {structure.paragraphRoles.map((r) => (
              <li key={r.paragraphNumber} className="flex gap-2">
                <span className="font-mono text-muted">[{String(r.paragraphNumber).padStart(2, '0')}]</span>
                <span>
                  <span className="mr-1.5 font-medium">{r.role}</span>
                  <span className="text-muted">{r.summary}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div
        ref={scrollRef}
        data-testid="passage-scroll"
        className={cn('min-h-0 flex-1', vertical ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto')}
      >
        <article
          lang="ja"
          data-writing-mode={writingMode}
          className={cn('passage-text p-4 text-[15px] md:p-6', vertical ? 'writing-vertical h-full py-8' : 'mx-auto max-w-2xl')}
        >
          <header className={cn(vertical ? 'ml-8' : 'mb-6')}>
            <h2 className="font-serif text-lg font-bold leading-snug tracking-normal">{passage.title}</h2>
            <p className="mt-1 font-sans text-xs tracking-normal text-muted">
              {passage.author}　{passage.sourceWork}
            </p>
          </header>
          {passage.paragraphs.map((para) => (
            <p key={para.paragraphNumber} className={cn(vertical ? 'ml-6' : 'mb-5 grid grid-cols-[2.25rem_1fr] gap-x-2')}>
              <span
                className={cn(
                  'select-none font-mono text-[11px] tracking-normal text-muted',
                  vertical ? 'mb-3 block' : 'pt-[0.65rem]',
                )}
                aria-label={`第${para.paragraphNumber}段落`}
              >
                [<span className={vertical ? 'tcy' : undefined}>{String(para.paragraphNumber).padStart(2, '0')}</span>]
              </span>
              <span>
                {segmentParagraph(para.text, para.underlines, markersOn).map((seg, i) => {
                  if (seg.kind === 'underline') {
                    const active = seg.underline.id === activeUnderlineId;
                    return (
                      <span
                        key={i}
                        ref={(el) => {
                          if (el) underlineRefs.current.set(seg.underline.id, el);
                          else underlineRefs.current.delete(seg.underline.id);
                        }}
                        data-underline-id={seg.underline.id}
                        data-active={active}
                        className={cn(
                          'rounded-sm transition-colors',
                          vertical ? 'border-r-2 border-accent/80 pr-0.5' : 'border-b-2 border-accent/80 pb-0.5',
                          active && 'animate-underline-flash bg-accent/20 text-accent',
                        )}
                      >
                        <span className="mr-1 font-sans text-[10px] tracking-normal text-accent/90">
                          {seg.underline.label}
                        </span>
                        {seg.text}
                      </span>
                    );
                  }
                  if (seg.kind === 'marker') {
                    return (
                      <mark key={i} className={cn('rounded-sm px-0.5', MARKER_CLASS[seg.marker])}>
                        {seg.text}
                      </mark>
                    );
                  }
                  return <span key={i}>{seg.text}</span>;
                })}
              </span>
            </p>
          ))}
        </article>
      </div>
    </div>
  );
}
