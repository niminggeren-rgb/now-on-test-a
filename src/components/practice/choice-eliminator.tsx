'use client';

import { useRef } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Check, Slash, Tag, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TRAP_METADATA_MAP,
  type ChoiceEliminationState,
  type ChoiceItem,
  type EliminationTraceEntry,
  type QuestionItem,
} from '@/types/domain';
import { TrapSelector } from './trap-selector';

export interface ChoiceResult {
  selectedLabel: number;
  trace: Record<string, EliminationTraceEntry>;
}

interface ChoiceEliminatorProps {
  question: QuestionItem;
  elimination: Record<string, ChoiceEliminationState>;
  focusedLabel: number | null;
  candidateLabel: number | null;
  trapPickerLabel: number | null;
  result: ChoiceResult | null;
  onFocus: (label: number) => void;
  /** 消去ボタン押下（消去した場合はトラップピッカーも開く）。 */
  onEliminateButton: (label: number) => void;
  onToggleTrapPicker: (label: number) => void;
  onAssignTrap: (label: number, trap: ChoiceEliminationState['userTaggedTrap']) => void;
  onClosePicker: () => void;
  onSelectCandidate: (label: number) => void;
  onSlashSegment: (label: number, segment: string | null) => void;
}

const revealContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const revealItem: Variants = {
  hidden: { opacity: 0, scale: 0.85, y: 6 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 24 } },
};

const CLAUSE_STYLE = {
  VALID: { label: '合致', box: 'border-emerald-500/40 bg-emerald-500/5', tag: 'text-emerald-400' },
  FLAWED: { label: '致命傷', box: 'border-rose-500/50 bg-rose-500/10', tag: 'text-rose-400' },
  NEUTRAL: { label: '補助', box: 'border-border bg-foreground/[0.03]', tag: 'text-muted' },
} as const;

function SlashedText({ content, segment }: { content: string; segment: string | null }) {
  const idx = segment ? content.indexOf(segment) : -1;
  if (!segment || idx < 0) return <>{content}</>;
  return (
    <>
      {content.slice(0, idx)}
      <mark
        data-testid="slashed-segment"
        className="bg-rose-500/15 text-rose-400 underline decoration-rose-500 decoration-wavy line-through"
      >
        {segment}
      </mark>
      {content.slice(idx + segment.length)}
    </>
  );
}

function ChoiceCard({
  choice,
  state,
  focused,
  candidate,
  pickerOpen,
  result,
  handlers,
}: {
  choice: ChoiceItem;
  state: ChoiceEliminationState | undefined;
  focused: boolean;
  candidate: boolean;
  pickerOpen: boolean;
  result: ChoiceResult | null;
  handlers: Omit<ChoiceEliminatorProps, 'question' | 'elimination' | 'focusedLabel' | 'candidateLabel' | 'trapPickerLabel' | 'result'>;
}) {
  const reduce = useReducedMotion();
  const contentRef = useRef<HTMLParagraphElement>(null);
  const label = choice.choiceLabel;
  const eliminated = state?.eliminated ?? false;
  const tagged = state?.userTaggedTrap ?? null;
  const revealed = result !== null;
  const entry = result?.trace[String(label)];
  const isSelected = result?.selectedLabel === label;

  function onContentMouseUp() {
    if (revealed) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    const root = contentRef.current;
    if (!sel || !text || !root || !sel.anchorNode || !root.contains(sel.anchorNode)) return;
    if (!choice.content.includes(text)) return;
    handlers.onSlashSegment(label, text);
    sel.removeAllRanges();
  }

  const stateLabel = revealed
    ? null
    : eliminated
      ? '消去済'
      : candidate
        ? '解答候補'
        : null;

  return (
    <>
      <motion.div
        data-testid={`choice-${label}`}
        data-state={eliminated ? 'ELIMINATED' : candidate ? 'SELECTED' : 'NEUTRAL'}
        onClick={() => handlers.onFocus(label)}
        animate={{ scale: eliminated && !revealed ? 0.985 : 1, opacity: eliminated && !revealed ? 0.45 : 1 }}
        transition={{ duration: reduce ? 0 : 0.18 }}
        className={cn(
          'relative rounded-lg border bg-surface p-3 transition-colors',
          focused && 'ring-2 ring-accent/70',
          candidate && !revealed && 'border-accent bg-accent/10',
          revealed && choice.isCorrect && 'border-emerald-500/60',
          revealed && isSelected && !choice.isCorrect && 'border-rose-500/60',
        )}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-xs',
              candidate && !revealed ? 'border-accent bg-accent text-white' : 'bg-background',
            )}
          >
            {candidate && !revealed ? <Check className="h-3.5 w-3.5" aria-label="解答候補" /> : label}
          </span>
          <div className="min-w-0 flex-1">
            {!revealed && (
              <p
                ref={contentRef}
                onMouseUp={onContentMouseUp}
                className={cn(
                  'font-serif text-sm leading-relaxed tracking-wide',
                  eliminated && 'line-through decoration-rose-500/60',
                )}
              >
                <SlashedText content={choice.content} segment={state?.slashedSegment ?? null} />
              </p>
            )}
            {revealed && <p className="font-serif text-sm leading-relaxed tracking-wide">{choice.content}</p>}

            {!revealed && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                {stateLabel && (
                  <span className={cn('rounded px-1.5 py-0.5', eliminated ? 'bg-rose-500/15 text-rose-400' : 'bg-accent/20 text-accent')}>
                    {stateLabel}
                  </span>
                )}
                {tagged && (
                  <span className={cn('rounded border px-1.5 py-0.5', TRAP_METADATA_MAP[tagged].badgeColorClass)}>
                    判定: {TRAP_METADATA_MAP[tagged].shortLabel}
                  </span>
                )}
                {state?.slashedSegment && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlers.onSlashSegment(label, null);
                    }}
                    className="min-h-9 rounded border px-2 py-1 text-muted hover:text-foreground mouse:min-h-0 mouse:px-1.5 mouse:py-0.5"
                  >
                    傷マーク解除
                  </button>
                )}
                <span className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlers.onEliminateButton(label);
                    }}
                    aria-label={`選択肢${label}を${eliminated ? '消去解除' : '消去'}`}
                    className="flex min-h-9 items-center gap-1 rounded border px-2 py-1 text-muted hover:text-foreground mouse:min-h-0 mouse:px-1.5 mouse:py-0.5"
                  >
                    <Slash className="h-3 w-3" aria-hidden />
                    消去<kbd className="hidden font-mono text-[10px] mouse:inline">X</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlers.onToggleTrapPicker(label);
                    }}
                    aria-label={`選択肢${label}のトラップ種別を指定`}
                    aria-expanded={pickerOpen}
                    className="flex min-h-9 items-center gap-1 rounded border px-2 py-1 text-muted hover:text-foreground mouse:min-h-0 mouse:px-1.5 mouse:py-0.5"
                  >
                    <Tag className="h-3 w-3" aria-hidden />
                    トラップ<kbd className="hidden font-mono text-[10px] mouse:inline">T</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlers.onSelectCandidate(label);
                    }}
                    aria-pressed={candidate}
                    aria-label={`選択肢${label}を解答候補にする`}
                    className="flex min-h-9 items-center gap-1 rounded border px-2 py-1 text-muted hover:text-foreground mouse:min-h-0 mouse:px-1.5 mouse:py-0.5"
                  >
                    <Check className="h-3 w-3" aria-hidden />
                    候補<kbd className="hidden font-mono text-[10px] mouse:inline">C</kbd>
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>

        {eliminated && !revealed && (
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M2 98 L98 2"
              stroke="rgb(244 63 94)"
              strokeWidth={2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: reduce ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: 'circOut' }}
            />
          </svg>
        )}

        {pickerOpen && !revealed && (
          <TrapSelector
            selected={tagged}
            onPick={(trap) => handlers.onAssignTrap(label, trap)}
            onClose={handlers.onClosePicker}
          />
        )}
      </motion.div>

      {revealed && (
        <motion.div variants={revealItem} className="mt-1 space-y-2 rounded-lg border bg-background/60 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {choice.isCorrect ? (
              <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-400">
                <Check className="h-3 w-3" aria-hidden />正解
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 font-medium text-rose-400">
                <X className="h-3 w-3" aria-hidden />
                {isSelected ? '不正解（あなたの解答）' : '誤答'}
              </span>
            )}
            {choice.primaryTrapType !== 'NONE' && (
              <span className={cn('rounded border px-1.5 py-0.5', TRAP_METADATA_MAP[choice.primaryTrapType].badgeColorClass)}>
                実際: {TRAP_METADATA_MAP[choice.primaryTrapType].shortLabel}
              </span>
            )}
            {choice.primaryTrapType !== 'NONE' && (
              <span className="rounded border px-1.5 py-0.5 text-muted">
                あなたの判定: {tagged ? TRAP_METADATA_MAP[tagged].shortLabel : '未指定'}
              </span>
            )}
            {entry?.isTrapMatch && (
              <motion.span
                data-testid={`trap-match-${label}`}
                variants={revealItem}
                className="rounded border border-amber-400/60 bg-gradient-to-r from-amber-400/25 to-yellow-300/25 px-1.5 py-0.5 font-mono font-bold text-amber-300"
              >
                TRAP MATCH! (+論理識別ボーナス)
              </motion.span>
            )}
          </div>
          <ol className="space-y-1">
            {choice.clauseBreakdown.map((clause, i) => {
              const style = CLAUSE_STYLE[clause.status];
              return (
                <li key={i} className={cn('rounded-md border-l-2 px-2 py-1.5', style.box)}>
                  <div className="font-serif text-[13px]">{clause.text}</div>
                  <div className="mt-0.5 flex gap-1.5">
                    <span className={cn('shrink-0 font-sans font-medium', style.tag)}>[{style.label}]</span>
                    <span className="text-muted">{clause.comment}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="leading-relaxed text-muted">{choice.trapExplanation}</p>
        </motion.div>
      )}
    </>
  );
}

export function ChoiceEliminator({
  question,
  elimination,
  focusedLabel,
  candidateLabel,
  trapPickerLabel,
  result,
  ...handlers
}: ChoiceEliminatorProps) {
  return (
    <motion.ul
      aria-label="選択肢"
      className="space-y-2"
      variants={revealContainer}
      initial="hidden"
      animate={result ? 'show' : 'hidden'}
    >
      {question.choices.map((choice) => (
        <li key={choice.id}>
          <ChoiceCard
            choice={choice}
            state={elimination[String(choice.choiceLabel)]}
            focused={focusedLabel === choice.choiceLabel}
            candidate={candidateLabel === choice.choiceLabel}
            pickerOpen={trapPickerLabel === choice.choiceLabel}
            result={result}
            handlers={handlers}
          />
        </li>
      ))}
    </motion.ul>
  );
}
