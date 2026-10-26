'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ScanSearch } from 'lucide-react';
import {
  customMaterialRepository,
  type InstructorCarteRecord,
  type TrapWeaknessScores,
} from '@/lib/repositories/customMaterialRepository';
import { WeaknessRadar } from './weakness-radar';

/** 模試W画像解析の結果（この端末に保存）を、講師カルテに表示するパネル */
export function ExamCartePanel() {
  const [records, setRecords] = useState<InstructorCarteRecord[] | null>(null);
  const [weaknesses, setWeaknesses] = useState<TrapWeaknessScores | null>(null);

  useEffect(() => {
    setRecords(customMaterialRepository.getInstructorCarteRecords());
    setWeaknesses(customMaterialRepository.getTrapWeaknesses());
  }, []);

  if (records === null || weaknesses === null) return null;

  return (
    <section className="mb-6 space-y-4 rounded-lg border bg-surface p-4 md:p-5" aria-labelledby="exam-carte-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="exam-carte-heading" className="flex items-center gap-2 text-sm font-semibold">
          <ScanSearch className="h-4 w-4 text-accent" aria-hidden />
          模試W画像診断の指導アドバイス（この端末の記録）
        </h2>
        <Link href="/exam-analysis" className="text-xs text-accent hover:underline">
          模試を診断する
        </Link>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-muted">
          まだ診断記録がありません。問題用紙と答案の写真を解析すると、指導アドバイスと弱点スコアがここに反映されます。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <ul className="space-y-3 lg:col-span-7">
            {records.slice(0, 3).map((r) => (
              <li key={r.id} className="space-y-2 rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold">{r.examTitle}</span>
                  <span className="font-mono text-muted">
                    {r.createdAt.slice(0, 10)} · 推定得点率 <strong className="text-foreground">{r.estimatedScoreRate}%</strong>
                  </span>
                </div>
                <p className="text-sm font-bold">「{r.headline}」</p>
                <ol className="list-inside list-decimal space-y-0.5 text-xs text-muted">
                  {r.actionPlan.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          <div className="lg:col-span-5">
            <p className="mb-1 text-center text-xs text-muted">最新の5大トラップ弱点スコア</p>
            <WeaknessRadar scores={weaknesses} />
          </div>
        </div>
      )}
    </section>
  );
}
