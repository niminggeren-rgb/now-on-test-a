'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, ListChecks, Target, XCircle } from 'lucide-react';
import { useTimer, formatElapsed } from '@/hooks/use-timer';
import { usePracticeShortcuts } from '@/hooks/use-practice-shortcuts';
import { useMediaQuery } from '@/hooks/use-media-query';
import { buildAttemptFromPractice } from '@/lib/analytics/protocolFromPractice';
import { protocolRepository } from '@/lib/repositories/protocolRepository';
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
import { ProtocolTools } from './protocol-tools';
import { MobileActionBar } from './mobile-action-bar';
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
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [qIndex, setQIndex] = useState(0);
  const [states, setStates] = useState<Record<string, QuestionState>>({});
  const [focusedLabel, setFocusedLabel] = useState<number | null>(null);
  const [pickerLabel, setPickerLabel] = useState<number | null>(null);
  const [writingMode, setWritingMode] = useState<WritingMode>('horizontal');
  const [markersOn, setMarkersOn] = useState(false);
  const [message, setMessage] = useState('');
  const [finished, setFinished] = useState(false);
  // モバイル（md 未満）では本文と設問をタブで切り替える。md 以上は左右スプリット。
  const [mobileTab, setMobileTab] = useState<'passage' | 'question'>('passage');
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
      setMessage('先に選択肢を選んでください（番号キー 1〜4 またはタップ）');
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
      setMessage('解答候補を指定してから確定してください（C キー／「候補」ボタン）');
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
      // プロトコル別の弱点マトリクスを更新（保存の失敗は演習の流れを止めない）
      const attempt = buildAttemptFromPractice(res.data.log, question);
      if (attempt) void protocolRepository.recordAttempt(attempt).catch(() => undefined);
      setStates((prev) => ({
        ...prev,
        [question.id]: { ...(prev[question.id] ?? EMPTY_STATE), result: res.data, elapsedMs: timeSpentMs },
      }));
    } finally {
      submittingRef.current = false;
    }
  }, [question, result, next, qState, getElapsedMs, repo, passage.id, pauseTimer]);

  // タッチ操作バー用（キーボードショートカットと同じ動作）
  const actEliminate = () => {
    if (result) return;
    const label = requireFocus();
    if (label === null) return;
    setPickerLabel(toggleEliminate(label) ? label : null);
  };
  const actTrap = () => {
    if (result) return;
    const label = requireFocus();
    if (label !== null) setPickerLabel((cur) => (cur === label ? null : label));
  };
  const actCandidate = () => {
    if (result) return;
    const label = requireFocus();
    if (label !== null) selectCandidate(label);
  };

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

  const underlineLabel = passage.paragraphs
    .flatMap((p) => p.underlines ?? [])
    .find((u) => u.id === question.targetUnderlineId)?.label;

  return (
    <div className="-m-4 flex h-[calc(100dvh-3rem)] flex-col md:-m-6">
      {/* モバイル: 本文 / 設問 の固定タブ（md 以上では非表示） */}
      <div role="tablist" aria-label="表示切替" className="grid shrink-0 grid-cols-2 border-b bg-surface md:hidden">
        {(
          [
            { id: 'passage', label: '本文', icon: BookOpen },
            { id: 'question', label: '設問', icon: ListChecks },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={mobileTab === id}
            onClick={() => setMobileTab(id)}
            className={cn(
              'flex h-11 items-center justify-center gap-1.5 border-b-2 text-sm',
              mobileTab === id ? 'border-accent font-medium text-foreground' : 'border-transparent text-muted',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section
          aria-label="本文"
          data-testid="pane-passage"
          className={cn(
            'min-h-0 flex-1 flex-col md:flex md:w-[52%] md:flex-none md:border-r',
            mobileTab === 'passage' ? 'flex' : 'hidden',
          )}
        >
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
            active={mobileTab === 'passage' || isDesktop}
          />
          <div className="shrink-0 border-t bg-surface p-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobileTab('question')}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-white active:opacity-80"
            >
              設問に進む
              <ListChecks className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </section>

        <section
          aria-label="設問"
          data-testid="pane-question"
          className={cn(
            'min-h-0 flex-1 overflow-y-auto p-4 md:block md:w-[48%] md:flex-none',
            mobileTab === 'question' ? 'block' : 'hidden',
          )}
        >
          {trapFocus && (
            <p className="mb-3 flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
              <Target className="h-3.5 w-3.5" aria-hidden />
              苦手トラップ集中特訓: {TRAP_METADATA_MAP[trapFocus].label}
            </p>
          )}

          <div role="tablist" aria-label="設問の選択" className="mb-3 flex gap-1.5">
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
                    'flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs mouse:min-h-0',
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

          <h3 className="mb-2 font-serif text-sm leading-relaxed tracking-wide" data-testid="question-prompt">
            {question.promptText}
          </h3>
          {underlineLabel && (
            <button
              type="button"
              onClick={() => setMobileTab('passage')}
              className="mb-4 flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs text-accent md:hidden"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              本文で{underlineLabel}を確認
            </button>
          )}

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
              <kbd className="hidden rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] mouse:inline">Space</kbd>
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
              passageText={passage.paragraphs.map((p) => p.text).join('\n')}
              onNext={next}
            />
          )}
        </section>
      </div>

      {/* タッチ端末: 親指で操作するボトムバー（設問タブ表示中のみ。md 以上のタッチ端末＝iPad では常時） */}
      <div className={cn(mobileTab === 'passage' && 'max-md:hidden')}>
        <MobileActionBar
          answered={result !== null}
          isLast={qIndex >= questions.length - 1}
          hasCandidate={qState.candidate !== null}
          message={message}
          onEliminate={actEliminate}
          onTrap={actTrap}
          onCandidate={actCandidate}
          onConfirm={() => void confirm()}
          onNext={next}
        />
      </div>

      {/* マウス＋キーボード環境（デスクトップ）専用のショートカットガイド */}
      <footer
        className="hidden shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t bg-surface px-4 py-2 mouse:md:flex"
        aria-label="ショートカットガイド"
      >
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

      {question && <ProtocolTools passage={passage} question={question} />}
    </div>
  );
}
