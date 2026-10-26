'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react';
import { countAnswerChars, descriptiveEvaluationSchema, type DescriptiveEvaluation } from '@/lib/descriptive-grading';
import { segmentParagraph } from '@/lib/passage-text';
import { cn } from '@/lib/utils';
import { actionResultSchemaOf } from '@/lib/schemas';
import type { PassageItem, QuestionItem } from '@/types/domain';

export interface DescriptiveEntry {
  /** 本文の表示に必要な項目のみ（他の設問の正解・模範解答をクライアントへ渡さない） */
  passage: Pick<PassageItem, 'id' | 'title' | 'author' | 'paragraphs'>;
  /** 模範解答は添削後に API 経由でのみ開示する */
  question: Pick<
    QuestionItem,
    'id' | 'promptText' | 'descriptiveCharLimit' | 'gradingRubric'
  >;
}

const MIN_TARGET = 350;
const DRAFT_PREFIX = 'lv:v1:draft:';
const responseSchema = actionResultSchemaOf(descriptiveEvaluationSchema);

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-rose-400';
}

export function DescriptiveWorkspace({ entries }: { entries: DescriptiveEntry[] }) {
  const [index, setIndex] = useState(0);
  const entry = entries[index];
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [evaluation, setEvaluation] = useState<DescriptiveEvaluation | null>(null);
  const [showModel, setShowModel] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const questionId = entry?.question.id;

  // 下書きの復元・切替時のリセット
  useEffect(() => {
    abortRef.current?.abort();
    setEvaluation(null);
    setError('');
    setShowModel(false);
    setChecked({});
    setLoading(false);
    if (!questionId) return;
    try {
      setAnswer(window.localStorage.getItem(DRAFT_PREFIX + questionId) ?? '');
    } catch {
      setAnswer('');
    }
  }, [questionId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const onChange = useCallback(
    (value: string) => {
      setAnswer(value);
      if (!questionId) return;
      try {
        window.localStorage.setItem(DRAFT_PREFIX + questionId, value);
      } catch {
        // 下書き保存はベストエフォート
      }
    },
    [questionId],
  );

  const limit = entry?.question.descriptiveCharLimit ?? 400;
  const count = countAnswerChars(answer);
  const ratio = Math.min(1, count / limit);
  const reached80 = count >= limit * 0.8;
  const over = count > limit;

  const rubric = useMemo(() => entry?.question.gradingRubric ?? [], [entry]);

  async function submit() {
    if (!entry || loading || count === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/evaluate-descriptive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passageId: entry.passage.id, questionId: entry.question.id, answer }),
        signal: controller.signal,
      });
      const parsed = responseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) {
        setError('添削結果を受け取れませんでした。時間をおいて再度お試しください。');
      } else if (!parsed.data.success) {
        setError(parsed.data.error);
      } else {
        setEvaluation(parsed.data.data);
        setShowModel(false);
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError('通信に失敗しました。ネットワークを確認して再度お試しください。');
      }
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  if (!entry) {
    return (
      <p className="mx-auto max-w-md rounded-lg border bg-surface p-8 text-center text-sm text-muted">
        記述問題が登録されていません。
      </p>
    );
  }

  const { passage, question } = entry;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section aria-label="本文" className="min-w-0">
        {entries.length > 1 && (
          <div role="tablist" className="mb-3 flex flex-wrap gap-1.5">
            {entries.map((e, i) => (
              <button
                key={e.question.id}
                role="tab"
                type="button"
                aria-selected={i === index}
                onClick={() => setIndex(i)}
                className={cn('rounded-md border px-2.5 py-1 text-xs', i === index ? 'border-accent bg-accent/15' : 'text-muted')}
              >
                {e.passage.title}
              </button>
            ))}
          </div>
        )}
        <article lang="ja" className="passage-text max-h-[75vh] overflow-y-auto rounded-lg border bg-surface p-5 text-[14px]">
          <h2 className="font-serif text-base font-bold leading-snug tracking-normal">{passage.title}</h2>
          <p className="mb-4 mt-1 font-sans text-xs tracking-normal text-muted">{passage.author}</p>
          {passage.paragraphs.map((para) => (
            <p key={para.paragraphNumber} className="mb-4">
              <span className="mr-2 font-mono text-[11px] tracking-normal text-muted">
                [{String(para.paragraphNumber).padStart(2, '0')}]
              </span>
              {segmentParagraph(para.text, para.underlines, false).map((seg, i) =>
                seg.kind === 'underline' ? (
                  <span key={i} className="border-b-2 border-accent/80 pb-0.5">{seg.text}</span>
                ) : (
                  <span key={i}>{seg.text}</span>
                ),
              )}
            </p>
          ))}
        </article>
      </section>

      <section aria-label="答案" className="min-w-0 space-y-4">
        <h3 className="font-serif text-sm leading-relaxed tracking-wide" data-testid="descriptive-prompt">
          {question.promptText}
        </h3>

        <div className="overflow-x-auto">
          <div className="inline-block rounded-lg border bg-surface p-3">
            {/* 原稿用紙風: 幅=20字 / 行間=1.9字分のマス目を背景に描画 */}
            <textarea
              value={answer}
              onChange={(e) => onChange(e.target.value)}
              rows={20}
              spellCheck={false}
              aria-label="記述答案"
              placeholder="ここに答案を入力（原稿用紙の1行は20字）"
              style={{
                width: 'calc(20em + 2px)',
                fontSize: '1.05rem',
                lineHeight: '1.9em',
                letterSpacing: 0,
                padding: 0,
                backgroundOrigin: 'content-box',
                backgroundAttachment: 'local',
                backgroundImage:
                  'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)',
                backgroundSize: '1em 1.9em',
              }}
              className="block resize-none border border-border bg-transparent font-serif text-foreground outline-none placeholder:text-muted/50 focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs">
            <span className={cn('font-mono text-sm tabular-nums', over && 'text-rose-400')} data-testid="char-count">
              {count} <span className="text-muted">/ {limit}字</span>
            </span>
            <span className="text-muted">
              {over ? (
                <span className="flex items-center gap-1 text-rose-400">
                  <AlertTriangle className="h-3 w-3" aria-hidden />
                  {count - limit}字オーバー（減点されます）
                </span>
              ) : reached80 ? (
                <span className="text-emerald-400">80%到達</span>
              ) : (
                `80%（${Math.ceil(limit * 0.8)}字）まであと ${Math.ceil(limit * 0.8) - count}字`
              )}
              {count > 0 && count < MIN_TARGET && !over && <span className="ml-2">目安 {MIN_TARGET}字以上</span>}
            </span>
          </div>
          <div
            className="relative mt-1.5 h-1.5 rounded-full bg-foreground/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(count, limit)}
          >
            <div
              className={cn('h-full rounded-full transition-all', over ? 'bg-rose-500' : reached80 ? 'bg-emerald-500' : 'bg-accent')}
              style={{ width: `${ratio * 100}%` }}
            />
            <span className="absolute left-[80%] top-[-3px] h-3 w-px bg-foreground/50" aria-hidden />
          </div>
        </div>

        <fieldset className="rounded-lg border bg-surface p-3">
          <legend className="px-1 text-xs font-medium text-muted">必須要素・キーワード自己チェック</legend>
          <ul className="space-y-2.5">
            {rubric.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={checked[r.id] ?? false}
                    onChange={(e) => setChecked((c) => ({ ...c, [r.id]: e.target.checked }))}
                    className="mt-0.5 accent-[hsl(var(--accent))]"
                  />
                  <span className="leading-relaxed">{r.element}</span>
                </label>
                <div className="mt-1 flex flex-wrap gap-1 pl-5">
                  {r.keywords.map((k) => {
                    const hit = answer.includes(k);
                    return (
                      <span
                        key={k}
                        data-hit={hit}
                        className={cn(
                          'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]',
                          hit ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'text-muted',
                        )}
                      >
                        {hit ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <Circle className="h-3 w-3" aria-hidden />}
                        {k}
                      </span>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </fieldset>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={loading || count === 0}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-white enabled:hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {loading ? '添削中…' : 'AI添削を実行'}
        </button>

        <p role="alert" className="min-h-4 text-xs text-rose-400">
          {error}
        </p>

        {evaluation && (
          <section aria-label="添削結果" data-testid="evaluation" className="space-y-4 rounded-lg border bg-surface p-4">
            <div className="flex items-end gap-4">
              <div>
                <div className="text-xs text-muted">総合得点</div>
                <div className={cn('font-mono text-4xl font-bold tabular-nums', scoreColor(evaluation.totalScore))} data-testid="total-score">
                  {evaluation.totalScore}
                  <span className="ml-1 text-base text-muted">/100</span>
                </div>
              </div>
              <span className="mb-1 rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted" data-testid="eval-source">
                {evaluation.source === 'gemini' ? 'Gemini 採点' : 'ローカル採点'}
              </span>
            </div>
            {evaluation.notice && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">{evaluation.notice}</p>}
            <p className="text-sm leading-relaxed">{evaluation.overallComment}</p>

            <div>
              <h4 className="mb-2 text-xs font-semibold text-muted">要素別の得点</h4>
              <ul className="space-y-2.5">
                {evaluation.rubricScores.map((r) => (
                  <li key={r.rubricId} className="text-xs">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="leading-relaxed">{r.element}</span>
                      <span className="shrink-0 font-mono">{r.earnedPoints}/{r.maxPoints}</span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-foreground/10">
                      <div
                        className={cn('h-full rounded-full', r.earnedPoints === r.maxPoints ? 'bg-emerald-500' : r.earnedPoints === 0 ? 'bg-rose-500' : 'bg-amber-500')}
                        style={{ width: `${(r.earnedPoints / Math.max(1, r.maxPoints)) * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-muted">{r.comment}</p>
                  </li>
                ))}
              </ul>
            </div>

            {evaluation.deductions.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold text-muted">減点箇所</h4>
                <ul className="space-y-2">
                  {evaluation.deductions.map((d, i) => (
                    <li key={i} className={cn('rounded-md border-l-2 px-2.5 py-1.5 text-xs', d.severity === 'major' ? 'border-rose-500/60 bg-rose-500/10' : 'border-amber-500/60 bg-amber-500/10')}>
                      {d.quote && <q className="block font-serif text-[13px]">{d.quote}</q>}
                      <span className="leading-relaxed">{d.issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {evaluation.logicalLeaps.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-semibold text-muted">論理の飛躍</h4>
                <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed">
                  {evaluation.logicalLeaps.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            )}

            <div>
              <h4 className="mb-2 text-xs font-semibold text-muted">改善リライト案</h4>
              <p className="whitespace-pre-wrap rounded-md border bg-background p-3 font-serif text-[13px] leading-relaxed">{evaluation.rewriteSuggestion}</p>
            </div>

            {evaluation.modelAnswerText && (
              <div>
                <button type="button" onClick={() => setShowModel((v) => !v)} aria-expanded={showModel} className="text-xs text-accent hover:underline">
                  {showModel ? '模範解答を隠す' : '模範解答を見る'}
                </button>
                {showModel && (
                  <p className="mt-2 rounded-md border bg-background p-3 font-serif text-[13px] leading-relaxed" data-testid="model-answer">
                    {evaluation.modelAnswerText}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </section>
    </div>
  );
}
