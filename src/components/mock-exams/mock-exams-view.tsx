'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBrowserRepository } from '@/lib/repository';
import { TRAP_METADATA_MAP, type ActiveTrapType, type MockExamRecord } from '@/types/domain';
import { cn } from '@/lib/utils';
import { ExamScoreForm } from './exam-score-form';
import { ExamSheetDropzone } from './exam-sheet-dropzone';
import { ScoreTrendChart } from './score-trend-chart';

function isTrapType(v: string): v is ActiveTrapType {
  return v in TRAP_METADATA_MAP;
}

export function MockExamsView() {
  const [repo] = useState(() => createBrowserRepository());
  const [exams, setExams] = useState<MockExamRecord[] | null>(null);
  const [weakTraps, setWeakTraps] = useState<ActiveTrapType[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([repo.listMockExams(), repo.getTrapStats()]).then(([list, stats]) => {
      if (cancelled) return;
      setExams(list);
      setWeakTraps(
        [...stats]
          .filter((s) => s.encounteredCount > 0)
          .sort((a, b) => b.weaknessScore - a.weaknessScore)
          .slice(0, 2)
          .map((s) => s.trapType),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const upsert = useCallback((record: MockExamRecord) => {
    setExams((prev) => {
      const rest = (prev ?? []).filter((e) => e.id !== record.id);
      return [...rest, record].sort((a, b) => a.examDate.localeCompare(b.examDate));
    });
  }, []);

  const newestFirst = useMemo(() => [...(exams ?? [])].reverse(), [exams]);

  if (!exams) {
    return <div className="mx-auto h-96 max-w-6xl animate-pulse rounded-lg border bg-surface" aria-busy="true" aria-label="読み込み中" />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section aria-label="得点・偏差値の推移" className="rounded-lg border bg-surface p-4">
        <h2 className="mb-4 text-sm font-semibold">得点・偏差値の推移</h2>
        <ScoreTrendChart exams={exams} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-label="模試成績の登録" className="rounded-lg border bg-surface p-4">
          <h2 className="mb-4 text-sm font-semibold">模試成績を登録</h2>
          <ExamScoreForm repo={repo} onAdded={upsert} />
        </section>
        <section aria-label="答案画像のAI解析" className="rounded-lg border bg-surface p-4">
          <h2 className="mb-4 text-sm font-semibold">答案・問題用紙のAI弱点解析</h2>
          <ExamSheetDropzone repo={repo} exams={exams} weakTraps={weakTraps} onSaved={upsert} />
        </section>
      </div>

      <section aria-label="模試の記録">
        <h2 className="mb-3 text-sm font-semibold">模試の記録</h2>
        <div className="overflow-x-auto rounded-lg border bg-surface">
          <table className="w-full min-w-[720px] text-left text-xs" data-testid="exam-table">
            <caption className="sr-only">模試の記録（新しい順）</caption>
            <thead className="border-b text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">実施日</th>
                <th scope="col" className="px-3 py-2 font-medium">模試</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">得点</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">偏差値</th>
                <th scope="col" className="px-3 py-2 font-medium">分析・メモ</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted">
                    模試の記録がありません。上のフォームから成績を登録してください。
                  </td>
                </tr>
              )}
              {newestFirst.map((e) => (
                <tr key={e.id} className="border-b align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-muted">{e.examDate}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{e.examName}</div>
                    <div className="text-muted">{e.examProvider}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">
                    {e.modernJapaneseScore}/{e.modernJapaneseMaxScore}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">{e.deviationValue.toFixed(1)}</td>
                  <td className="px-3 py-2.5">
                    {e.analyzedWeaknesses && e.analyzedWeaknesses.length > 0 && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {e.analyzedWeaknesses.filter(isTrapType).map((t) => (
                          <span key={t} className={cn('rounded border px-1.5 py-0.5 text-[11px]', TRAP_METADATA_MAP[t].badgeColorClass)}>
                            {TRAP_METADATA_MAP[t].shortLabel}
                          </span>
                        ))}
                      </div>
                    )}
                    {e.aiOverallAdvice && <p className="leading-relaxed">{e.aiOverallAdvice}</p>}
                    {e.selfReflection && <p className="mt-1 leading-relaxed text-muted">メモ: {e.selfReflection}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
