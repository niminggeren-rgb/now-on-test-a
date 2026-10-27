'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GitCompare, Headphones, Pause, Play, Sparkles, Square, X } from 'lucide-react';
import { ProtocolLogicReader, scrollParagraphIntoView, type ReaderState } from '@/lib/audio/logicReader';
import { protocolRepository } from '@/lib/repositories/protocolRepository';
import { cn } from '@/lib/utils';
import type { PassageItem, QuestionItem } from '@/types/domain';
import type { ProtocolWeaknessMatrix } from '@/types/protocol';
import { LogicDiagram } from './logic-diagram';
import { SocratesMentorPanel } from './socrates-mentor-panel';

type Tab = 'mentor' | 'map' | 'reader';

const SPEEDS = [0.8, 1, 1.2, 1.5];

/** 朗読中の段落に印を付ける（本文側の [data-paragraph-index] を直接触る。再描画の影響を受けない） */
function markReadingParagraph(index: number | null): void {
  document.querySelectorAll('[data-reading="true"]').forEach((el) => el.removeAttribute('data-reading'));
  if (index !== null) document.querySelector(`[data-paragraph-index="${index}"]`)?.setAttribute('data-reading', 'true');
}

function ReaderTab({ paragraphs }: { paragraphs: string[] }) {
  const readerRef = useRef<ProtocolLogicReader | null>(null);
  const [state, setState] = useState<ReaderState>('idle');
  const [progress, setProgress] = useState(0);
  const [marker, setMarker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const supported = typeof window !== 'undefined' && ProtocolLogicReader.isSupported();

  useEffect(() => {
    const reader = new ProtocolLogicReader({
      onStateChange: setState,
      onProgress: (i, total) => setProgress(total === 0 ? 0 : Math.round((i / total) * 100)),
      onParagraphChange: (p) => {
        markReadingParagraph(p);
        scrollParagraphIntoView(p);
      },
      onMarkerEmphasis: (c) => setMarker(c.text),
      onChunkStart: (c) => {
        if (!c.isLogicalMarker) setMarker(null);
      },
      onComplete: () => {
        markReadingParagraph(null);
        setProgress(100);
      },
      onError: setError,
    });
    reader.compilePassage(paragraphs);
    readerRef.current = reader;
    return () => {
      reader.stop();
      markReadingParagraph(null);
    };
  }, [paragraphs]);

  useEffect(() => {
    readerRef.current?.setBaseSpeed(speed);
  }, [speed]);

  if (!supported) {
    return <p className="p-6 text-center text-xs text-muted">お使いのブラウザは音声読み上げ（Web Speech API）に対応していません。</p>;
  }

  return (
    <div className="space-y-4 p-4">
      <p className="text-xs leading-relaxed text-muted">
        逆接・換言・因果などの論理マーカーの直前で0.4秒止まり、マーカー自体を強調して読み上げます。読んでいる段落は本文側でハイライトされます。
      </p>
      <div className="flex items-center gap-2">
        {state === 'playing' ? (
          <button type="button" onClick={() => readerRef.current?.pause()} className="flex min-h-11 items-center gap-1.5 rounded-lg border px-4 text-xs font-semibold">
            <Pause className="h-4 w-4" aria-hidden />一時停止
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              readerRef.current?.play();
            }}
            className="flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-semibold text-white"
          >
            <Play className="h-4 w-4" aria-hidden />
            {state === 'paused' ? '再開' : '本文を朗読'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            readerRef.current?.stop();
            setProgress(0);
            setMarker(null);
            markReadingParagraph(null);
          }}
          disabled={state === 'idle'}
          aria-label="停止"
          className="flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-40"
        >
          <Square className="h-4 w-4" aria-hidden />
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          速度
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="min-h-9 rounded-md border bg-background px-1.5 text-xs">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                ×{s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="朗読の進行">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      {marker && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400">論理マーカー: 「{marker}」</p>}
      {error && (
        <p className="text-xs text-rose-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface ProtocolToolsProps {
  passage: PassageItem;
  question: QuestionItem;
}

/** 演習画面に常駐する「思考プロトコル」ドロワー（AIメンター・論理マップ・論理ポーズ朗読） */
export function ProtocolTools({ passage, question }: ProtocolToolsProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('mentor');
  const [matrix, setMatrix] = useState<ProtocolWeaknessMatrix | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void protocolRepository.getMatrix().then((m) => !cancelled && setMatrix(m));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const paragraphs = useMemo(() => passage.paragraphs.map((p) => p.text), [passage]);
  const underline = useMemo(() => {
    for (const p of passage.paragraphs) {
      const u = p.underlines?.find((x) => x.id === question.targetUnderlineId);
      if (u) return { text: u.text, paragraphNumber: p.paragraphNumber };
    }
    return { text: '', paragraphNumber: 0 };
  }, [passage, question.targetUnderlineId]);
  // 正解の情報は渡さない（メンターが直接答えを漏らせないようにする）
  const choices = useMemo(() => question.choices.map((c) => ({ id: String(c.choiceLabel), text: c.content })), [question]);

  const tabs: { id: Tab; label: string; icon: typeof Sparkles }[] = [
    { id: 'mentor', label: 'AIメンター', icon: Sparkles },
    { id: 'map', label: '論理マップ', icon: GitCompare },
    { id: 'reader', label: '朗読', icon: Headphones },
  ];

  if (!mounted) return null;

  // transform を持つ祖先の内側に置くと fixed が壊れるため、body へポータルする
  return createPortal(
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-accent px-4 text-xs font-bold text-white shadow-lg md:bottom-6"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          思考プロトコル
        </button>
      )}

      {/* 閉じても外さず隠すだけにして、対話の履歴と朗読の再生を保つ */}
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
            role="dialog"
            aria-label="思考プロトコル"
            className={cn(
              open ? 'flex' : 'hidden',
              "fixed inset-x-0 bottom-0 z-50 h-[85dvh] flex-col rounded-t-2xl border bg-surface shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[420px] md:rounded-none md:border-y-0 md:border-r-0",
            )}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div role="tablist" aria-label="ツール" className="flex gap-1">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    role="tab"
                    type="button"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn('flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs', tab === id ? 'bg-accent/15 font-semibold text-foreground' : 'text-muted hover:text-foreground')}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:text-foreground">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div hidden={tab !== 'mentor'} className="h-full">
                <SocratesMentorPanel
                  key={question.id}
                  passageTitle={passage.title}
                  paragraphs={paragraphs}
                  questionText={question.promptText}
                  underlinedPart={underline.text}
                  underlinedParagraphNumber={underline.paragraphNumber}
                  choices={choices}
                  weaknessMatrix={matrix}
                />
              </div>
              <div hidden={tab !== 'map'}>
                <LogicDiagram
                  passageTitle={passage.title}
                  authorName={passage.author}
                  paragraphs={paragraphs}
                  cacheKey={passage.id}
                  onSelectParagraph={(i) => {
                    markReadingParagraph(i);
                    scrollParagraphIntoView(i);
                  }}
                />
              </div>
              <div hidden={tab !== 'reader'}>
                <ReaderTab paragraphs={paragraphs} />
              </div>
            </div>
      </aside>
    </>,
    document.body,
  );
}
