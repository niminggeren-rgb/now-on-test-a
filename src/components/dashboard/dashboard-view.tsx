'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Gauge, ShieldAlert, Target, Timer } from 'lucide-react';
import { computeKpis } from '@/lib/analytics';
import { buildPracticeHref, type QuestionIndex, type TrapIndex } from '@/lib/passage-summary';
import { createBrowserRepository } from '@/lib/repository';
import { TRAP_METADATA_MAP, type ActiveTrapType, type AnswerLog, type TrapWeaknessStat } from '@/types/domain';
import { cn } from '@/lib/utils';
import { RecentLogsTable } from './recent-logs-table';
import { SeverityBadge, TrapAnalysisPanel } from './trap-analysis-panel';

interface DashboardViewProps {
  questionIndex: QuestionIndex;
  trapIndex: TrapIndex;
  env: { appMode: string; supabase: boolean; gemini: boolean };
}

function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  note,
  children,
}: {
  icon: typeof Gauge;
  label: string;
  value?: string;
  unit?: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      {value !== undefined && (
        <div className="mt-2 font-mono text-3xl font-semibold tabular-nums">
          {value}
          {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
        </div>
      )}
      {children}
      {note && <p className="mt-1.5 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

export function DashboardView({ questionIndex, trapIndex, env }: DashboardViewProps) {
  const [data, setData] = useState<{ stats: TrapWeaknessStat[]; logs: AnswerLog[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const repo = createBrowserRepository();
    void Promise.all([repo.getTrapStats(), repo.listAnswerLogs(10)]).then(([stats, logs]) => {
      if (!cancelled) setData({ stats, logs });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hrefFor = (trap: ActiveTrapType): string | null => {
    const [first, ...rest] = trapIndex[trap];
    return first ? buildPracticeHref(first, trap, rest) : null;
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl space-y-6" aria-busy="true" aria-label="読み込み中">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border bg-surface" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-lg border bg-surface" />
      </div>
    );
  }

  const kpi = computeKpis(data.stats, data.logs);
  const worstMeta = kpi.worstTrap ? TRAP_METADATA_MAP[kpi.worstTrap.trapType] : null;
  const quickHref = kpi.worstTrap ? hrefFor(kpi.worstTrap.trapType) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section aria-label="KPIサマリー" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Gauge}
          label="論理消去精度"
          value={kpi.logicPrecision === null ? '—' : kpi.logicPrecision.toFixed(1)}
          unit="%"
          note="トラップ種別まで言い当てた率"
        />
        <KpiCard
          icon={Target}
          label="正答率（難関大評論文）"
          value={kpi.accuracy === null ? '—' : kpi.accuracy.toFixed(0)}
          unit="%"
          note={`直近 ${kpi.accuracySample} 問`}
        />
        <KpiCard
          icon={Timer}
          label="平均解答スピード"
          value={kpi.avgSeconds === null ? '—' : String(kpi.avgSeconds)}
          unit="秒/問"
          note={`直近 ${kpi.accuracySample} 問`}
        />
        <KpiCard icon={ShieldAlert} label="最要注意トラップ">
          {kpi.worstTrap && worstMeta ? (
            <div className="mt-2 space-y-1.5">
              <div className="text-lg font-semibold leading-tight">{worstMeta.shortLabel}</div>
              <SeverityBadge score={kpi.worstTrap.weaknessScore} />
              <p className="font-mono text-[11px] text-muted">弱点スコア {kpi.worstTrap.weaknessScore.toFixed(1)}</p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">データなし</p>
          )}
        </KpiCard>
      </section>

      <section aria-label="トラップ別弱点分析">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">トラップ別弱点分析</h2>
          <span className="text-xs text-muted">各トラップをクリックすると処方箋と演習リンクを表示します</span>
          <Link
            href={quickHref ?? '/practice'}
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90',
            )}
          >
            {worstMeta ? `${worstMeta.shortLabel}を集中特訓` : '演習を始める'}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        <div className="rounded-lg border bg-surface p-4">
          <TrapAnalysisPanel stats={data.stats} practiceHrefFor={hrefFor} />
        </div>
      </section>

      <section aria-label="直近の消去プロセス履歴">
        <h2 className="mb-3 text-sm font-semibold">直近の消去プロセス履歴</h2>
        <RecentLogsTable logs={data.logs} questionIndex={questionIndex} />
      </section>

      <p className="font-mono text-[11px] text-muted">
        mode: {env.appMode} · supabase: {env.supabase ? 'configured' : 'not configured (mock)'} · gemini:{' '}
        {env.gemini ? 'configured' : 'not configured (local fallback)'}
      </p>
    </div>
  );
}
