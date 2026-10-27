'use client';

import { useState } from 'react';
import { Loader2, Network, Route } from 'lucide-react';
import type { ExplanationChoice, OnDemandExplanationResponse, OnDemandMode } from '@/lib/ai/schemas/phase8Schemas';
import { fetchOnDemandExplanationWithCache, type ExplanationSource } from '@/lib/cache/explanationCache';
import { TRAP_METADATA_MAP } from '@/types/domain';

interface Props {
  passageText: string;
  questionPrompt: string;
  choices: readonly ExplanationChoice[];
}

type Entry = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: OnDemandExplanationResponse; source: ExplanationSource };

const SOURCE_BADGE: Record<ExplanationSource, string> = {
  localStorage: 'CACHE HIT (0 token)',
  supabase: 'CACHE HIT (shared)',
  'gemini-api': 'GENERATED',
};

const BUTTONS: { mode: OnDemandMode; label: string; icon: typeof Network }[] = [
  { mode: 'BINARY_OPPOSITION_MAP', label: '本文の論理構造マップ（二項対立）', icon: Network },
  { mode: 'THINKING_PROCESS', label: '解法の思考プロセス', icon: Route },
];

/** ボタンを押したときだけ解説を取得する（初期表示では API を使わない） */
export function OnDemandExplanation({ passageText, questionPrompt, choices }: Props) {
  const [entries, setEntries] = useState<Partial<Record<OnDemandMode, Entry>>>({});
  const [open, setOpen] = useState<OnDemandMode | null>(null);

  const load = async (mode: OnDemandMode) => {
    setOpen(mode);
    if (entries[mode]?.status === 'ready' || entries[mode]?.status === 'loading') return;
    setEntries((prev) => ({ ...prev, [mode]: { status: 'loading' } }));
    try {
      const { data, source } = await fetchOnDemandExplanationWithCache({ mode, passageText, questionPrompt, choices });
      setEntries((prev) => ({ ...prev, [mode]: { status: 'ready', data, source } }));
    } catch (err) {
      setEntries((prev) => ({ ...prev, [mode]: { status: 'error', message: err instanceof Error ? err.message : '解説の取得に失敗しました。' } }));
    }
  };

  const entry = open ? entries[open] : undefined;

  return (
    <section aria-label="AI解説" className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {BUTTONS.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            onClick={() => void load(mode)}
            aria-pressed={open === mode}
            className="flex min-h-10 items-center gap-1.5 rounded-md border px-3 text-xs hover:bg-foreground/5 aria-pressed:border-accent aria-pressed:bg-accent/10"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {entry?.status === 'loading' && (
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          解説を生成しています…
        </p>
      )}
      {entry?.status === 'error' && (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs" role="alert">
          {entry.message}
        </p>
      )}
      {entry?.status === 'ready' && (
        <div className="space-y-3 rounded-md border bg-background/60 p-3 text-xs leading-relaxed">
          <span className="inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted">{SOURCE_BADGE[entry.source]}</span>
          {entry.data.binaryOppositionMap && <OppositionMap map={entry.data.binaryOppositionMap} />}
          {entry.data.thinkingProcess && <ThinkingProcess process={entry.data.thinkingProcess} />}
        </div>
      )}
    </section>
  );
}

function OppositionMap({ map }: { map: NonNullable<OnDemandExplanationResponse['binaryOppositionMap']> }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold">{map.coreThesis}</p>
      <p className="text-muted">対立軸: {map.oppositionAxisLabel}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {[map.sideA, map.sideB].map((s, i) => (
          <div key={i} className="rounded border p-2">
            <div className="font-semibold">{i === 0 ? 'A' : 'B'}｜{s.label}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {s.keywords.map((k) => (
                <span key={k} className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px]">{k}</span>
              ))}
            </div>
            <p className="mt-1 text-muted">{s.logicSummary}</p>
          </div>
        ))}
      </div>
      <ol className="space-y-1">
        {map.abstractionToConcreteFlow.map((f, i) => (
          <li key={i} className="text-muted">
            <span className="font-mono text-foreground">{f.paragraphRange}</span> [{f.role}] {f.summary}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ThinkingProcess({ process: p }: { process: NonNullable<OnDemandExplanationResponse['thinkingProcess']> }) {
  return (
    <ol className="space-y-3">
      <li>
        <div className="font-semibold">{p.step1DemonstrativeAndTarget.title}</div>
        <p className="text-muted">{p.step1DemonstrativeAndTarget.targetAnalysis}</p>
        <ul className="list-inside list-disc text-muted">
          {p.step1DemonstrativeAndTarget.requiredElements.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </li>
      <li>
        <div className="font-semibold">{p.step2ContrastAndParaphrase.title}</div>
        {p.step2ContrastAndParaphrase.quotedEvidenceSentences.map((q) => (
          <p key={q} className="italic text-muted">「{q}」</p>
        ))}
        <p>{p.step2ContrastAndParaphrase.paraphraseEquation}</p>
      </li>
      <li>
        <div className="font-semibold">Step 3: 傷が明白な順に切る</div>
        <ul className="space-y-1">
          {[...p.step3OptionEliminationOrder].sort((a, b) => a.rank - b.rank).map((s) => (
            <li key={`${s.rank}-${s.optionNumber}`} className="text-muted">
              <span className="font-mono text-foreground">
                {s.rank}. 選択肢{s.optionNumber} {s.verdict === 'ELIMINATE' ? '× 切る' : '○ 残す'}
              </span>
              {s.trapType && <span>（{TRAP_METADATA_MAP[s.trapType].shortLabel}）</span>} {s.logicalReason}
            </li>
          ))}
        </ul>
      </li>
    </ol>
  );
}
