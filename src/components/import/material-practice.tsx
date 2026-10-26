'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { trapBadgeClass } from '@/lib/import-material';
import { TRAP_LABELS, type ImportedMaterial } from '@/types/ai-pipeline';

/** 取り込んだ教材をその場で解く簡易の消去法演習（タップ/クリック操作） */
export function MaterialPractice({ material }: { material: ImportedMaterial }) {
  const [eliminated, setEliminated] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="max-h-[75dvh] space-y-4 overflow-y-auto rounded-lg border bg-surface p-4 md:p-6">
        <div className="border-b pb-3">
          <h2 className="text-lg font-bold">{material.title}</h2>
          <p className="text-xs text-muted">{material.author}</p>
        </div>
        {material.paragraphs.map((p) => (
          <p key={p.paragraphNumber} className="passage-text text-sm indent-4">
            <span className="mr-2 rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted">
              [{p.paragraphNumber}]
            </span>
            {p.content}
          </p>
        ))}
      </section>

      <div className="max-h-[75dvh] space-y-4 overflow-y-auto">
        {material.questions.map((q, qIdx) => {
          const selectedId = selected[qIdx];
          const showResult = revealed[qIdx] === true;
          return (
            <section key={`${q.questionNumber}-${qIdx}`} className="space-y-4 rounded-lg border bg-surface p-4 md:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-accent/15 px-2.5 py-1 text-xs font-bold">{q.questionNumber}</span>
                <span className="text-xs text-muted">誤りだと思う選択肢を「消去」し、解答を1つ選ぶ</span>
              </div>
              <p className="text-sm font-semibold">{q.questionText}</p>
              {q.logicalHint && (
                <div className="rounded-md border border-accent/30 bg-accent/10 p-3 text-xs">
                  <strong>論理着眼ヒント:</strong> {q.logicalHint}
                </div>
              )}

              <div className="space-y-3">
                {q.choices.map((c) => {
                  const key = `${qIdx}-${c.id}`;
                  const isEliminated = eliminated[key] === true;
                  const isSelected = selectedId === c.id;
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'rounded-md border p-3 transition-opacity',
                        isEliminated && 'opacity-50',
                        isSelected ? 'border-accent bg-accent/10' : 'bg-background',
                        showResult && c.isCorrect && 'border-emerald-500/60',
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={showResult}
                          aria-pressed={isSelected}
                          onClick={() => setSelected((prev) => ({ ...prev, [qIdx]: c.id }))}
                          className="flex min-h-11 items-center gap-2 text-xs font-bold"
                        >
                          <span
                            className={cn(
                              'flex h-6 min-w-6 items-center justify-center rounded-full border px-1',
                              isSelected ? 'border-accent bg-accent text-white' : 'text-muted',
                            )}
                          >
                            {c.id}
                          </span>
                          これを解答にする
                        </button>
                        <button
                          type="button"
                          aria-pressed={isEliminated}
                          onClick={() => setEliminated((prev) => ({ ...prev, [key]: !isEliminated }))}
                          className="min-h-11 rounded border px-3 text-[11px] text-muted hover:text-foreground"
                        >
                          {isEliminated ? '消去を解除' : '× 誤答として消去'}
                        </button>
                      </div>

                      <p className={cn('text-xs leading-relaxed', isEliminated && 'line-through')}>
                        {c.slashSegments.length > 0
                          ? c.slashSegments.map((seg, sIdx) => (
                              <span key={sIdx}>
                                <span
                                  className={cn(
                                    'rounded px-0.5',
                                    showResult && seg.status === 'trap' && 'bg-rose-500/30 underline decoration-rose-400',
                                    showResult && seg.status === 'valid' && 'bg-emerald-500/25',
                                  )}
                                >
                                  {seg.segmentText}
                                </span>
                                {sIdx < c.slashSegments.length - 1 && (
                                  <span className="mx-1.5 font-bold text-muted" aria-hidden>
                                    /
                                  </span>
                                )}
                              </span>
                            ))
                          : c.text}
                      </p>

                      {showResult && (
                        <div className="mt-3 space-y-1 border-t pt-2.5 text-xs">
                          <span className={cn('inline-block rounded border px-2 py-0.5 font-bold', trapBadgeClass(c.trapType))}>
                            {TRAP_LABELS[c.trapType]}
                          </span>
                          <p className="text-muted">{c.trapExplanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setRevealed((prev) => ({ ...prev, [qIdx]: true }))}
                disabled={!selectedId || showResult}
                className="min-h-11 w-full rounded-md bg-accent text-xs font-semibold text-white disabled:opacity-40"
              >
                解答を確定してトラップ解説・根拠を表示
              </button>

              {showResult && (
                <div className="space-y-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                  <p className="font-bold text-emerald-400">
                    {q.choices.find((c) => c.id === selectedId)?.isCorrect ? '正解！' : '不正解'}　本文の根拠箇所:
                  </p>
                  <p className="italic">「{q.evidenceQuote}」</p>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
