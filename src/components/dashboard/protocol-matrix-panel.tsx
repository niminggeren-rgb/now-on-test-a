'use client';

import { useEffect, useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { protocolRepository } from '@/lib/repositories/protocolRepository';
import { cn } from '@/lib/utils';
import {
  PROTOCOL_STEP_IDS,
  SIX_MAJOR_TRAPS,
  VERNACULAR_PROTOCOL_STEPS,
  type ProtocolStepId,
  type ProtocolWeaknessMatrix,
} from '@/types/protocol';

function scoreOf(m: ProtocolWeaknessMatrix, id: ProtocolStepId): number | null {
  return { STEP_1: m.step1MacroScore, STEP_2: m.step2DeconstructScore, STEP_3: m.step3NavigationScore, STEP_4: m.step4EliminationScore }[id];
}

/**
 * 思考プロトコル（Step 1〜4）別の到達度と、トラップ別の失点率、自動処方箋。
 * 演習の記録が無い間は何も表示しない（ダミーの点数は出さない）。
 */
export function ProtocolMatrixPanel({ heading = '思考プロトコル診断（この端末の記録）' }: { heading?: string }) {
  const [matrix, setMatrix] = useState<ProtocolWeaknessMatrix | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => void protocolRepository.getMatrix().then((m) => !cancelled && setMatrix(m));
    load();
    window.addEventListener('lv-protocol-updated', load);
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      window.removeEventListener('lv-protocol-updated', load);
      window.removeEventListener('focus', load);
    };
  }, []);

  if (!matrix || matrix.totalAttempts === 0) return null;

  const traps = Object.entries(matrix.trapStats)
    .filter(([, s]) => s.encountered > 0)
    .sort(([, a], [, b]) => b.failureRate - a.failureRate);

  return (
    <section aria-label={heading} className="space-y-4 rounded-lg border bg-surface p-4 md:p-5" data-testid="protocol-matrix">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Stethoscope className="h-4 w-4 text-accent" aria-hidden />
          {heading}
        </h2>
        <span className="font-mono text-[11px] text-muted">{matrix.totalAttempts}問の記録</span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {PROTOCOL_STEP_IDS.map((id) => {
          const meta = VERNACULAR_PROTOCOL_STEPS[id];
          const score = scoreOf(matrix, id);
          const weakest = id === matrix.weakestStep && score !== null;
          return (
            <li key={id} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className={cn('font-medium', weakest && 'text-rose-400')}>
                  Step {meta.stepNumber} {meta.japaneseTitle}
                  {weakest && <span className="ml-1.5 text-[10px]">最弱点</span>}
                </span>
                <span className="font-mono tabular-nums text-muted">{score === null ? '未計測' : Math.round(score)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                <div className={cn('h-full', weakest ? 'bg-rose-400' : 'bg-accent')} style={{ width: `${score ?? 0}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted">Step 1〜3 は、選択肢のトラップ（すり替え・主客転倒・局所矛盾/言及なし）への引っかかりからの推定値です。</p>

      {traps.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold">トラップ別の失点率</h3>
          <ul className="flex flex-wrap gap-1.5">
            {traps.map(([type, s]) => (
              <li key={type} className="rounded border bg-background px-2 py-1 font-mono text-[11px]">
                {SIX_MAJOR_TRAPS[type as keyof typeof SIX_MAJOR_TRAPS].shortLabel} {s.failureRate}%
                <span className="text-muted">（{s.failed}/{s.encountered}）</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="rounded-md border border-accent/30 bg-accent/5 p-3 text-xs leading-relaxed">{matrix.clinicalPrescription}</p>
    </section>
  );
}
