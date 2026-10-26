'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import {
  buildPrescription,
  SEVERITY_LABEL,
  severityOf,
  toTrapRates,
  type Severity,
} from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { TRAP_METADATA_MAP, type ActiveTrapType, type TrapWeaknessStat } from '@/types/domain';
import { SERIES, TrapRadarChart } from './trap-radar-chart';

const SEVERITY_STYLE: Record<Severity, { icon: typeof AlertOctagon; cls: string }> = {
  critical: { icon: AlertOctagon, cls: 'border-rose-500/40 bg-rose-500/10 text-rose-400' },
  caution: { icon: AlertTriangle, cls: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  good: { icon: CheckCircle2, cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
};

export function SeverityBadge({ score }: { score: number }) {
  const severity = severityOf(score);
  const { icon: Icon, cls } = SEVERITY_STYLE[severity];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium', cls)}>
      <Icon className="h-3 w-3" aria-hidden />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

interface TrapAnalysisPanelProps {
  stats: readonly TrapWeaknessStat[];
  /** トラップを含む問題への直行リンク。null ならリンクを出さない。 */
  practiceHrefFor?: (trap: ActiveTrapType) => string | null;
  /** 初期選択（既定は弱点スコア最大のトラップ） */
  initialTrap?: ActiveTrapType;
}

export function TrapAnalysisPanel({ stats, practiceHrefFor, initialTrap }: TrapAnalysisPanelProps) {
  const rates = useMemo(() => toTrapRates(stats), [stats]);
  const worst = useMemo(() => [...stats].sort((a, b) => b.weaknessScore - a.weaknessScore)[0]?.trapType, [stats]);
  const [selected, setSelected] = useState<ActiveTrapType | null>(initialTrap ?? null);
  const active = selected ?? worst ?? 'OVERSTATEMENT';
  const stat = stats.find((s) => s.trapType === active);
  const prescription = stat ? buildPrescription(stat) : null;
  const href = practiceHrefFor?.(active) ?? null;
  const meta = TRAP_METADATA_MAP[active];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <TrapRadarChart rates={rates} />

      <div className="min-w-0 space-y-4">
        <ul className="space-y-1.5" aria-label="トラップ別の内訳">
          {rates.map((r) => {
            const m = TRAP_METADATA_MAP[r.trapType];
            const isActive = r.trapType === active;
            return (
              <li key={r.trapType}>
                <button
                  type="button"
                  onClick={() => setSelected(r.trapType)}
                  aria-pressed={isActive}
                  data-trap={r.trapType}
                  className={cn(
                    'w-full rounded-md border p-2.5 text-left transition-colors hover:bg-foreground/5',
                    isActive ? 'border-accent bg-accent/10' : 'border-border',
                  )}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className={cn('rounded border px-1.5 py-0.5 font-medium', m.badgeColorClass)}>{m.shortLabel}</span>
                    <SeverityBadge score={r.weaknessScore} />
                    <span className="ml-auto font-mono text-[10px] text-muted">遭遇 {r.encountered}</span>
                    <ChevronRight className={cn('h-3.5 w-3.5 text-muted', isActive && 'text-accent')} aria-hidden />
                  </div>
                  <div className="mt-2 space-y-1">
                    {[
                      { s: SERIES.trapped, v: r.trappedRate },
                      { s: SERIES.detect, v: r.detectRate },
                    ].map(({ s, v }) => (
                      <div key={s.key} className="flex items-center gap-2 text-[11px]">
                        <span className="w-16 shrink-0 text-muted">{s.label}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: s.color }} />
                        </div>
                        <span className="w-12 shrink-0 text-right font-mono">{v.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {prescription && (
          <section aria-label="論理処方箋" data-testid="prescription" className="rounded-lg border bg-background/60 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold">{meta.label}</h4>
              <SeverityBadge score={stat?.weaknessScore ?? 0} />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{prescription.evidence}</p>
            <h5 className="mt-3 text-xs font-semibold">なぜ引っかかるのか</h5>
            <p className="mt-1 text-xs leading-relaxed">{prescription.why}</p>
            <h5 className="mt-3 text-xs font-semibold">処方箋</h5>
            <p className="mt-1 text-xs leading-relaxed">{prescription.drill}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">確認ポイント: {meta.checkPoint}</p>
            {href && (
              <Link
                href={href}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                このトラップを含む問題で演習する
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
