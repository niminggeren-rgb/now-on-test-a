'use client';

import { Fragment, useEffect, useState } from 'react';
import { ArrowDown, BookOpen, CheckCircle2, GitCompare, Network, Sparkles, XCircle } from 'lucide-react';
import { LogicDiagramDataSchema } from '@/lib/ai/schemas/protocolSchemas';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/types/action';
import type { BinaryOppositionAxis, LogicDiagramData } from '@/types/protocol';

interface LogicDiagramProps {
  passageTitle: string;
  authorName?: string;
  paragraphs: string[];
  /** 本文ごとの端末キャッシュのキー（同じ本文で API を再消費しない） */
  cacheKey: string;
  /** 段落番号（0 始まり）を選んだとき */
  onSelectParagraph?: (paragraphIndex: number) => void;
}

const CACHE_PREFIX = 'lv_logic_diagram_v1_';

function fnv(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

function readCache(key: string): LogicDiagramData | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = LogicDiagramDataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function ParagraphChips({ numbers, onSelect }: { numbers: number[]; onSelect?: (index: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {numbers.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onSelect?.(n - 1)}
          className="inline-flex min-h-8 items-center gap-1 rounded border bg-background px-2 text-[10px] text-muted hover:text-foreground"
        >
          <BookOpen className="h-3 w-3" aria-hidden />第{n}段落
        </button>
      ))}
    </div>
  );
}

function AxisCard({ axis, tone, label, onSelect }: { axis: BinaryOppositionAxis; tone: 'a' | 'b'; label: string; onSelect?: (i: number) => void }) {
  const a = tone === 'a';
  return (
    <div className={cn('space-y-3 rounded-xl border p-4', a ? 'border-rose-500/30 bg-rose-500/5' : 'border-emerald-500/30 bg-emerald-500/5')}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold',
          a ? 'border-rose-500/30 bg-rose-500/15 text-rose-400' : 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
        )}
      >
        {a ? <XCircle className="h-3 w-3" aria-hidden /> : <CheckCircle2 className="h-3 w-3" aria-hidden />}
        {label}
      </span>
      <h4 className="text-base font-bold">{axis.poleLabel}</h4>
      <ParagraphChips numbers={axis.paragraphs} onSelect={onSelect} />
      <div className="flex flex-wrap gap-1.5">
        {axis.keywords.map((k) => (
          <span key={k} className="rounded-full border bg-background px-2 py-0.5 text-[11px]">
            #{k}
          </span>
        ))}
      </div>
      <ul className="list-inside list-disc space-y-1 text-xs text-muted">
        {axis.coreAttributes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

/** Step 1（全体構造スキャン）: 二項対立の左右対比と、段落ごとの論理ツリー */
export function LogicDiagram({ passageTitle, authorName, paragraphs, cacheKey, onSelectParagraph }: LogicDiagramProps) {
  const storageKey = `${CACHE_PREFIX}${cacheKey}_${fnv(paragraphs.join('\n'))}`;
  const [data, setData] = useState<LogicDiagramData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'opposition' | 'tree'>('opposition');

  useEffect(() => {
    setData(readCache(storageKey));
  }, [storageKey]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/logic-diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passageTitle, authorName, paragraphs }),
      });
      const json = (await res.json().catch(() => null)) as ActionResult<unknown> | null;
      if (!json || !json.success) throw new Error(json && !json.success ? json.error : '論理マップの生成に失敗しました。');
      const parsed = LogicDiagramDataSchema.parse(json.data);
      setData(parsed);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(parsed));
      } catch {
        // 保存できなくても表示は続ける
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return (
      <div className="space-y-3 p-6 text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
          <GitCompare className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="text-sm font-bold">Step 1: 二項対立・全体構造スキャン</h3>
        <p className="text-xs text-muted">本文の「A概念 vs B概念」と、筆者の主張に至る論理ツリーを可視化します。</p>
        {error && (
          <p className="text-xs text-rose-400" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          {loading ? '構造を解析しています…' : '二項対立マップを生成する'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-accent">Step 1 · Macro Scan</p>
        <h3 className="mt-0.5 text-sm font-bold">中心の問い：{data.centralQuestion}</h3>
      </div>

      <div role="tablist" aria-label="表示切替" className="flex gap-1 rounded-lg border bg-background p-1">
        {(
          [
            { id: 'opposition', label: '二項対立', icon: GitCompare },
            { id: 'tree', label: '論理ツリー', icon: Network },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn('flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-xs', tab === id ? 'bg-accent text-white' : 'text-muted hover:text-foreground')}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === 'opposition' ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <AxisCard axis={data.axisA} tone="a" label={`対立軸 A（${data.axisA.stance === 'critique' ? '通念・批判対象' : '対比概念'}）`} onSelect={onSelectParagraph} />
            <AxisCard axis={data.axisB} tone="b" label={`対立軸 B（${data.axisB.stance === 'advocate' ? '筆者の主張' : '対比概念'}）`} onSelect={onSelectParagraph} />
          </div>

          {data.dimensions.length > 0 && (
            <div className="overflow-hidden rounded-xl border">
              <p className="border-b bg-surface px-3 py-2 text-xs font-bold">対比マトリクス（「すり替え」トラップ防止チェック表）</p>
              <div className="divide-y text-xs">
                {data.dimensions.map((d) => (
                  <div key={d.dimensionName} className="grid grid-cols-1 md:grid-cols-12">
                    <div className="p-3 text-rose-400 md:col-span-5">{d.axisAValue}</div>
                    <div className="flex items-center justify-center bg-surface p-2 text-center font-bold md:col-span-2">{d.dimensionName}</div>
                    <div className="p-3 text-emerald-400 md:col-span-5">{d.axisBValue}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col items-center">
            <svg className="h-8 w-64 text-accent/60" viewBox="0 0 256 32" fill="none" aria-hidden>
              <path d="M32 2 C32 18, 128 14, 128 30" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
              <path d="M224 2 C224 18, 128 14, 128 30" stroke="currentColor" strokeWidth="2" />
            </svg>
            <div className="w-full rounded-xl border border-accent/40 bg-accent/10 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-accent">Synthesis · 筆者の主張</p>
              <p className="mt-1 text-sm font-medium leading-relaxed">{data.synthesisThesis}</p>
            </div>
          </div>
        </div>
      ) : (
        <ol className="space-y-2">
          {data.logicTree.map((node, i) => (
            <Fragment key={node.id}>
              <li className="space-y-2 rounded-xl border bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent">{node.roleLabel}</span>
                  {node.logicalMarkerUsed && (
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                      論理マーカー: {node.logicalMarkerUsed}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed">{node.summary}</p>
                <ParagraphChips numbers={node.paragraphNumbers} onSelect={onSelectParagraph} />
              </li>
              {i < data.logicTree.length - 1 && (
                <li aria-hidden className="flex justify-center">
                  <ArrowDown className="h-4 w-4 text-muted" />
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      )}
    </div>
  );
}
