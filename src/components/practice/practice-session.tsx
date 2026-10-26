'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Target, XCircle } from 'lucide-react';
import { useTimer, formatElapsed } from '@/hooks/use-timer';
import { usePracticeShortcuts } from '@/hooks/use-practice-shortcuts';
import { createBrowserRepository, type SubmitAnswerResult } from '@/lib/repository';
import { ACTIVE_TRAP_TYPES } from '@/lib/scoring';
import { cn } from '@/lib/utils';
import {
  TRAP_METADATA_MAP,
  type ActiveTrapType,
  type ChoiceEliminationState,
  type PassageItem,
  type QuestionItem,
} from '@/types/domain';
import { ChoiceEliminator } from './choice-eliminator';
import { ExplanationDrawer } from './explanation-drawer';
import { PassageReader, type WritingMode } from './passage-reader';

interface QuestionState {
  elimination: Record<string, ChoiceEliminationState>;
  candidate: number | null;
  result: SubmitAnswerResult | null;
  elapsedMs: number;
}

const EMPTY_STATE: QuestionState = { elimination: {}, candidate: null, result: null, elapsedMs: 0 };
const WRITING_MODE_KEY = 'lv:writing-mode';

interface PracticeSessionProps {
  passage: PassageItem;
  /** 苦手トラップ集中特訓モード: このトラップを含む設問だけを出題する */
  trapFocus: ActiveTrapType | null;
  /** 特訓モードで次に進む文章の URL（なければ null） */
  nextPassageHref: string | null;
}

const GUIDE_KEYS: { keys: string; label: string }[] = [
  { keys: '1-4', label: '選択' },
  { keys: 'X', label: '消去' },
  { keys: 'T', label: 'トラップ指定' },
  { keys: 'C', label: '解答候補' },
  { keys: 'Space', label: '確定' },
  { keys: 'N', label: '次へ' },
  { keys: 'V', label: '縦/横' },
  { keys: 'M', label: 'マーカー' },
];

export function PracticeSession({ passage, trapFocus, nextPassageHref }: PracticeSessionProps) {
  const questions = useMemo<QuestionItem[]>(
    () =>
      passage.questions.filter(
        (q) =>
          q.questionType === 'MULTIPLE_CHOICE' &&
          (!trapFocus || q.choices.some((c) => c.primaryTrapType === trapFocus)),
      ),
    [passage, trapFocus],
  );

  const [repo] = useState(() => createBrowserRepository());
  const [qIndex, setQIndex] = useState(0);
  const [states, setStates] = useState<Record<string, QuestionState>>({});
  const [focusedLabel, setFocusedLabel] = useState<number | null>(null);
  const [pickerLabel, setPickerLabel] = useState<number | null>(null);
  const [writingMode, setWritingMode] = useState<WritingMode>('horizontal');
  const [markersOn, setMarkersOn] = useState(false);
  const [message, setMessage] = useState('');
  const [finished, setFinished] = useState(false);
  const submittingRef = useRef(false);

  const timer = useTimer(true);
  const { pause: pauseTimer, reset: resetTimer, getElapsedMs } = timer;

  const question = questions[qIndex];
  const qState = (question && states[question.id]) || EMPTY_STATE;
  const result = qState.result;

  // 書字方向の復元（SSR との不一致を避けるためマウント後に読む）
  useEffect(() => {
    try {
      if (window.localStorage.getItem(WRITING_MODE_KEY) === 'vertical') setWritingMode('vertical');
    } catch {
      // noop
    }
  }, []);

  // 設問切替時にタイマーを復元/リセット
  const questionId = question?.id;
  useEffect(() => {
    if (!questionId) return;
    const saved = states[questionId];
    resetTimer(saved?.elapsedMs ?? 0);
    if (saved?.result) pauseTimer();
    setFocusedLabel(null);
    setPickerLabel(null);
    setMessage('');
    // states は切替時点のスナップショットだけを使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, resetTimer, pauseTimer]);

  const patch = useCallback(
    (fn: (s: QuestionState) => QuestionState) => {
      if (!questionId) return;
      setStates((prev) => ({ ...prev, [questionId]: fn(prev[questionId] ?? EMPTY_STATE) }));
    },
    [questionId],
  );

  const toggleWritingMode = useCallback(() => {
    setWritingMode((m) => {
      const next: WritingMode = m === 'horizontal' ? 'vertical' : 'horizontal';
      try {
        window.localStorage.setItem(WRITING_MODE_KEY, next);
      } catch {
        // noop
      }
      return next;
    });
  }, []);
  const toggleMarkers = useCallback(() => setMarkersOn((v) => !v), []);

  const requireFocus = useCallback((): number | null => {
    if (focusedLabel === null) {
      setMessage('先に 1〜4 キーで選択肢を選んでください');
      return null;
    }
    return focusedLabel;
  }, [focusedLabel]);

  const toggleEliminate = useCallback(
    (label: number): boolean => {
      // updater 内ではなく描画時点の state から次の値を決める（戻り値を同期的に使うため）
      const nowEliminated = !(qState.elimination[String(label)]?.eliminated ?? false);
      patch((s) => {
        const cur = s.elimination[String(label)] ?? { eliminated: false, userTaggedTrap: null, slashedSegment: null };
        return {
          ...s,
          candidate: nowEliminated && s.candidate === label ? null : s.candidate,
          elimination: { ...s.elimination, [String(label)]: { ...cur, eliminated: nowEliminated } },
        };
      });
      return nowEliminated;
    },
    [patch, qState],
  );

  const assignTrap = useCallback(
    (label: number, trap: ActiveTrapType | null) => {
      patch((s) => {
        const cur = s.elimination[String(label)] ?? { eliminated: false, userTaggedTrap: null, slashedSegment: null };
        // トラップを指定した選択肢は「誤り」と判断したものとして消去扱いにする
        const eliminated = trap !== null ? true : cur.eliminated;
        return {
          ...s,
          candidate: trap !== null && s.candidate === label ? null : s.candidate,
          elimination: { ...s.elimination, [String(label)]: { ...cur, userTaggedTrap: trap, eliminated } },
        };
      });
      setPickerLabel(null);
    },
    [patch],
  );

  const selectCandidate = useCallback(
    (label: number) => {
      patch((s) => {
        const cur = s.elimination[String(label)];
        return {
          ...s,
          candidate: s.candidate === label ? null : label,
          // 解答候補にした選択肢は消去状態を解除する
          elimination: cur?.eliminated
            ? { ...s.elimination, [String(label)]: { ...cur, eliminated: false } }
            : s.elimination,
        };
      });
      setMessage('');
    },
    [patch],
  );

  const slashSegment = useCallback(
    (label: number, segment: string | null) => {
      patch((s) => {
        const cur = s.elimination[String(label)] ?? { eliminated: false, userTaggedTrap: null, slashedSegment: null };
        return { ...s, elimination: { ...s.elimination, [String(label)]: { ...cur, slashedSegment: segment } } };
      });
    },
    [patch],
  );

  const goTo = useCallback(
    (index: number) => {
      if (!question || index === qIndex || index < 0 || index >= questions.length) return;
      const elapsed = getElapsedMs();
      setStates((prev) => {
        const cur = prev[question.id] ?? EMPTY_STATE;
        return cur.result ? prev : { ...prev, [question.id]: { ...cur, elapsedMs: elapsed } };
      });
      setQIndex(index);
    },
    [question, qIndex, questions.length, getElapsedMs],
  );

  const next = useCallback(() => {
    if (!result) {
      setMessage('解答を確定してから次へ進めます（C で候補 → Space で確定）');
      return;
    }
    if (qIndex >= questions.length - 1) setFinished(true);
    else setQIndex(qIndex + 1);
  }, [result, qIndex, questions.length]);

  const confirm = useCallback(async () => {
    if (!question) return;
    if (result) {
      next();
      return;
    }
    if (qState.candidate === null) {
      setMessage('C キーで解答候補を指定してから Space で確定してください');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const timeSpentMs = Math.round(getElapsedMs());
      const elimination = Object.fromEntries(
        Object.entries(qState.elimination).filter(([, v]) => v.eliminated || v.userTaggedTrap || v.slashedSegment),
      );
      const res = await repo.submitAnswer({
        passageId: passage.id,
        questionId: question.id,
        selectedChoiceLabel: qState.candidate,
        elimination,
        timeSpentMs,
        confidenceLevel: null,
      });
      if (!res.success) {
        setMessage(res.error);
        return;
      }
      pauseTimer();
      setPickerLabel(null);
      setMessage('');
      setStates((prev) => ({
        ...prev,
        [question.id]: { ...(prev[question.id] ?? EMPTY_STATE), result: res.data, elapsedMs: timeSpentMs },
      }));
    } finally {
      submittingRef.current = false;
    }
  }, [question, result, next, qState, getElapsedMs, repo, passage.id, pauseTimer]);

  usePracticeShortcuts(
    {
      onFocusChoice: (label) => {
        setFocusedLabel(label);
        setPickerLabel(null);
        setMessage('');
      },
      onToggleEliminate: () => {
        if (result) return;
        const label = requireFocus();
        if (label !== null) toggleEliminate(label);
      },
      onToggleTrapPicker: () => {
        if (result) return;
        const label = requireFocus();
        if (label !== null) setPickerLabel((cur) => (cur === label ? null : label));
      },
      onPickTrap: (keyNumber) => {
        const type = ACTIVE_TRAP_TYPES.find((t) => TRAP_METADATA_MAP[t].keyNumber === keyNumber);
        if (type && pickerLabel !== null) assignTrap(pickerLabel, type);
      },
      onClearTrap: () => {
        if (pickerLabel !== null) assignTrap(pickerLabel, null);
      },
      onEscape: () => setPickerLabel(null),
      onSelectCandidate: () => {
        if (result) return;
        const label = requireFocus();
        if (label !== null) selectCandidate(label);
      },
      onConfirm: () => void confirm(),
      onNext: next,
      onToggleWritingMode: toggleWritingMode,
      onToggleMarkers: toggleMarkers,
    },
    { enabled: !finished && !!question, choiceCount: question?.choices.length ?? 4, trapPickerOpen: pickerLabel !== null && !result },
  );

  if (!question) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-surface p-8 text-center">
        <p className="text-sm">
          {trapFocus
            ? `この文章に「${TRAP_METADATA_MAP[trapFocus].shortLabel}」を含む選択問題はありません。`
            : 'この文章には選択問題がありません。'}
        </p>
        <Link href="/practice" className="mt-4 inline-block text-sm text-accent hover:underline">
          問題一覧へ戻る
        </Link>
      </div>
    );
  }

  if (finished) {
    const done = questions.map((q) => states[q.id]?.result).filter((r): r is SubmitAnswerResult => !!r);
    const correct = done.filter((r) => r.log.isCorrect).length;
    const matches = done.reduce((n, r) => n + Object.values(r.log.eliminationTrace).filter((t) => t.isTrapMatch).length, 0);
    const avgSec = done.length ? Math.round(done.reduce((n, r) => n + r.log.timeSpentMs, 0) / done.length / 1000) : 0;
    return (
      <div className="mx-auto max-w-lg rounded-lg border bg-surface p-8" data-testid="session-summary">
        <h2 className="text-base font-semibold">演習結果</h2>
        <p className="mt-1 text-xs text-muted">{passage.title}</p>
        <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-md border bg-background p-3">
            <dt className="text-xs text-muted">正答</dt>
            <dd className="mt-1 font-mono text-lg">{correct}/{questions.length}</dd>
          </div>
          <div className="rounded-md border bg-background p-3">
            <dt className="text-xs text-muted">トラップ識別</dt>
            <dd className="mt-1 font-mono text-lg">{matches}</dd>
          </div>
          <div className="rounded-md border bg-background p-3">
            <dt className="text-xs text-muted">平均解答時間</dt>
            <dd className="mt-1 font-mono text-lg">{avgSec}s</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          {nextPassageHref && (
            <Link href={nextPassageHref} className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
              次の文章へ
            </Link>
          )}
          <Link href="/practice" className="rounded-md border px-3 py-2 text-sm hover:bg-foreground/5">問題一覧</Link>
          <Link href="/" className="rounded-md border px-3 py-2 text-sm hover:bg-foreground/5">ダッシュボード</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section aria-label="本文" className="h-[45%] min-h-0 border-b lg:h-auto lg:w-[52%] lg:border-b-0 lg:border-r">
          <PassageReader
            passage={passage}
            activeUnderlineId={question.targetUnderlineId}
            writingMode={writingMode}
            markersOn={markersOn}
            onToggleWritingMode={toggleWritingMode}
            onToggleMarkers={toggleMarkers}
            structureUnlocked={result !== null}
            timerLabel={formatElapsed(timer.elapsedMs)}
            timerRunning={timer.running}
          />
        </section>

        <section aria-label="設問" className="min-h-0 flex-1 overflow-y-auto p-4 lg:w-[48%] lg:flex-none">
          {trapFocus && (
            <p className="mb-3 flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
              <Target className="h-3.5 w-3.5" aria-hidden />
              苦手トラップ集中特訓: {TRAP_METADATA_MAP[trapFocus].label}
            </p>
          )}

          <div role="tablist" aria-label="設問" className="mb-3 flex gap-1.5">
            {questions.map((q, i) => {
              const r = states[q.id]?.result;
              return (
                <button
                  key={q.id}
                  role="tab"
                  type="button"
                  aria-selected={i === qIndex}
                  onClick={() => goTo(i)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs',
                    i === qIndex ? 'border-accent bg-accent/15 text-foreground' : 'text-muted hover:text-foreground',
                  )}
                >
                  問{q.questionNumber}
                  {r && (r.log.isCorrect ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-label="正解" />
                  ) : (
                    <XCircle className="h-3 w-3 text-rose-400" aria-label="不正解" />
                  ))}
                </button>
              );
            })}
          </div>

          <h3 className="mb-4 font-serif text-sm leading-relaxed tracking-wide" data-testid="question-prompt">
            {question.promptText}
          </h3>

          <ChoiceEliminator
            question={question}
            elimination={qState.elimination}
            focusedLabel={focusedLabel}
            candidateLabel={qState.candidate}
            trapPickerLabel={result ? null : pickerLabel}
            result={result ? { selectedLabel: result.log.selectedChoiceLabel ?? 0, trace: result.log.eliminationTrace } : null}
            onFocus={(label) => {
              setFocusedLabel(label);
              setPickerLabel((cur) => (cur === label ? cur : null));
            }}
            onEliminateButton={(label) => {
              setFocusedLabel(label);
              if (toggleEliminate(label)) setPickerLabel(label);
              else setPickerLabel(null);
            }}
            onToggleTrapPicker={(label) => {
              setFocusedLabel(label);
              setPickerLabel((cur) => (cur === label ? null : label));
            }}
            onAssignTrap={assignTrap}
            onClosePicker={() => setPickerLabel(null)}
            onSelectCandidate={(label) => {
              setFocusedLabel(label);
              selectCandidate(label);
            }}
            onSlashSegment={slashSegment}
          />

          {!result && (
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={qState.candidate === null}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white enabled:hover:opacity-90 disabled:opacity-40"
            >
              解答を確定
              <kbd className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px]">Space</kbd>
            </button>
          )}

          <p role="status" aria-live="polite" className="mt-3 min-h-4 text-xs text-amber-400">
            {message}
          </p>

          {result && (
            <ExplanationDrawer
              result={result}
              timeLabel={formatElapsed(qState.elapsedMs)}
              isLast={qIndex >= questions.length - 1}
              onNext={next}
            />
          )}
        </section>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t bg-surface px-4 py-2" aria-label="ショートカットガイド">
        {GUIDE_KEYS.map((g) => (
          <span key={g.keys} className="flex items-center gap-1.5 text-[11px] text-muted">
            <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground">{g.keys}</kbd>
            {g.label}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-foreground">?</kbd>
          ヘルプ
        </span>
      </footer>
    </div>
  );
}
