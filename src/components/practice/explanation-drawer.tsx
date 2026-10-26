'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import type { SubmitAnswerResult } from '@/lib/repository';
import { cn } from '@/lib/utils';
import { TRAP_METADATA_MAP } from '@/types/domain';

interface ExplanationDrawerProps {
  result: SubmitAnswerResult;
  timeLabel: string;
  isLast: boolean;
  onNext: () => void;
}

export function ExplanationDrawer({ result, timeLabel, isLast, onNext }: ExplanationDrawerProps) {
  const reduce = useReducedMotion();
  const { log, question, stats, synced } = result;
  const matches = Object.values(log.eliminationTrace).filter((t) => t.isTrapMatch).length;
  const trapped = question.choices.find((c) => c.choiceLabel === log.selectedChoiceLabel);
  const trappedMeta = trapped && !trapped.isCorrect && trapped.primaryTrapType !== 'NONE'
    ? TRAP_METADATA_MAP[trapped.primaryTrapType]
    : null;
  const trappedStat = trappedMeta ? stats.find((s) => s.trapType === trappedMeta.type) : undefined;

  return (
    <motion.section
      aria-label="論理解説"
      data-testid="explanation-drawer"
      initial={{ opacity: 0, y: reduce ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.2 }}
      className="mt-4 rounded-lg border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        {log.isCorrect ? (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
            <CheckCircle2 className="h-4 w-4" aria-hidden />正解
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-rose-400">
            <XCircle className="h-4 w-4" aria-hidden />不正解（正解は {question.correctChoiceLabel}）
          </span>
        )}
        <span className="font-mono text-xs text-muted">解答時間 {timeLabel}</span>
        <span className="font-mono text-xs text-muted">トラップ識別 {matches} 件</span>
        {!synced && <span className="ml-auto text-[11px] text-muted">ローカルに保存済み</span>}
      </div>

      {trappedMeta && (
        <p className={cn('mt-3 rounded-md border px-3 py-2 text-xs leading-relaxed', trappedMeta.badgeColorClass)}>
          あなたは「{trappedMeta.label}」に引っかかりました。
          {trappedStat && <>（累計 弱点スコア {trappedStat.weaknessScore.toFixed(1)}）</>}
          <br />
          次回の確認ポイント: {trappedMeta.checkPoint}
        </p>
      )}

      <p className="mt-3 text-sm leading-relaxed">{question.explanationSummary}</p>

      <ol className="mt-3 space-y-2">
        {question.logicalDerivationSteps.map((step) => (
          <li key={step.stepNumber} className="flex gap-2 text-xs">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] text-muted">
              {step.stepNumber}
            </span>
            <div>
              <div className="font-medium">{step.title}</div>
              <div className="leading-relaxed text-muted">{step.content}</div>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={onNext}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        {isLast ? '結果を見る' : '次の設問へ'}
        <kbd className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px]">Space</kbd>
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    </motion.section>
  );
}
