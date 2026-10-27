'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Zap } from 'lucide-react';
import type { OptionMatchStatus, QuestionReasoningMatchSummary } from '@/lib/logic/reasoningMatcher';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<OptionMatchStatus, string> = {
  LOGICAL_HIT: 'border-amber-400/50 bg-amber-500/15 text-amber-300',
  PARTIAL_HIT: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  LUCKY_ELIMINATION: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  WRONG_ELIMINATION: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  FATAL_KEEP: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  CORRECT_SELECTION: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

/** 消去の理由が実際の傷と合っていたかを、選択肢ごとに表示する */
export function ReasoningMatchPanel({ summary }: { summary: QuestionReasoningMatchSummary }) {
  const reduce = useReducedMotion();
  return (
    <section aria-label="論理消去の照合結果" data-testid="reasoning-match" className="mt-3 space-y-2 rounded-md border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold">
          <Zap className="h-3.5 w-3.5 text-amber-400" aria-hidden />
          Reasoning Match
        </h3>
        <span className="font-mono text-xs text-muted">論理一致度 {summary.logicalHitScore}%</span>
        {summary.isLogicalHitMaster && (
          <motion.span
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 14 }}
            className="rounded border border-amber-400/60 bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300"
          >
            LOGICAL HIT!
          </motion.span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">{summary.overallDiagnosis}</p>
      <ul className="space-y-1.5">
        {summary.verdicts.map((v) => (
          <li key={v.optionNumber} className="flex flex-wrap items-start gap-2 text-xs">
            <span className="font-mono text-muted">選択肢{v.optionNumber}</span>
            <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold', STATUS_STYLE[v.status])}>{v.badgeText}</span>
            <span className="min-w-0 flex-1 basis-48 leading-relaxed text-muted">{v.feedbackMessage}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
