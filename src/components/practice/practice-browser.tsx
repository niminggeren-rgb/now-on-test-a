'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Clock, Flame, Star } from 'lucide-react';
import { createBrowserRepository } from '@/lib/repository';
import { formatSeconds, matchesTierFilter, THEME_LABELS, TIER_FILTER_LABELS, TIER_LABELS, type TierFilter } from '@/lib/labels';
import { buildPracticeHref, type PassageSummary, type TrapIndex } from '@/lib/passage-summary';
import { cn } from '@/lib/utils';
import { TRAP_METADATA_MAP, type TrapWeaknessStat } from '@/types/domain';

type DifficultyFilter = 'ALL' | 4 | 5;

export function PracticeBrowser({ passages, trapIndex }: { passages: PassageSummary[]; trapIndex: TrapIndex }) {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('ALL');
  const [tier, setTier] = useState<TierFilter>('ALL');
  const [stats, setStats] = useState<TrapWeaknessStat[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createBrowserRepository()
      .getTrapStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () =>
      passages.filter(
        (p) => (difficulty === 'ALL' || p.difficultyLevel === difficulty) && matchesTierFilter(p.targetTier, tier),
      ),
    [passages, difficulty, tier],
  );

  // 弱点スコアが最も高く、かつ出題可能な文章があるトラップ
  const worst = useMemo(() => {
    if (!stats) return null;
    return (
      [...stats]
        .filter((s) => s.encounteredCount > 0 && s.weaknessScore > 0 && (trapIndex[s.trapType]?.length ?? 0) > 0)
        .sort((a, b) => b.weaknessScore - a.weaknessScore)[0] ?? null
    );
  }, [stats, trapIndex]);

  function startWeaknessMode() {
    if (!worst) return;
    const [first, ...rest] = trapIndex[worst.trapType];
    if (first) router.push(buildPracticeHref(first, worst.trapType, rest));
  }

  const worstMeta = worst ? TRAP_METADATA_MAP[worst.trapType] : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section
        aria-label="苦手トラップ集中特訓"
        className="flex flex-wrap items-center gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
      >
        <Flame className="h-5 w-5 text-amber-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">苦手トラップ集中特訓モード</h2>
          <p className="mt-0.5 text-xs text-muted">
            {worstMeta && worst ? (
              <>
                現在もっとも引っかかっているのは
                <span className={cn('mx-1 rounded border px-1.5 py-0.5', worstMeta.badgeColorClass)}>{worstMeta.label}</span>
                <span className="font-mono">（弱点スコア {worst.weaknessScore.toFixed(1)}）</span>
                。このトラップを含む設問だけを連続で演習します。
              </>
            ) : stats === null ? (
              '弱点データを読み込み中です…'
            ) : (
              'まだ弱点データがありません。何問か解くと、引っかかりやすいトラップを集中特訓できます。'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={startWeaknessMode}
          disabled={!worst}
          className="rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-black enabled:hover:opacity-90 disabled:opacity-40"
        >
          特訓を開始
        </button>
      </section>

      <section aria-label="絞り込み" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5" role="group" aria-label="難易度">
          <span className="text-muted">難易度</span>
          {(['ALL', 4, 5] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={difficulty === d}
              onClick={() => setDifficulty(d)}
              className={cn(
                'rounded-md border px-2 py-1',
                difficulty === d ? 'border-accent bg-accent/15' : 'text-muted hover:text-foreground',
              )}
            >
              {d === 'ALL' ? 'すべて' : `★${d}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="志望校ティア">
          <span className="text-muted">志望校</span>
          {(Object.keys(TIER_FILTER_LABELS) as TierFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tier === t}
              onClick={() => setTier(t)}
              className={cn(
                'rounded-md border px-2 py-1',
                tier === t ? 'border-accent bg-accent/15' : 'text-muted hover:text-foreground',
              )}
            >
              {TIER_FILTER_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      {filtered.length === 0 ? (
        <p className="rounded-lg border bg-surface p-8 text-center text-sm text-muted">条件に合う文章がありません。</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link
                href={`/practice/${encodeURIComponent(p.id)}`}
                className="block h-full rounded-lg border bg-surface p-4 transition-colors hover:border-accent/60"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-medium text-accent">
                    {THEME_LABELS[p.theme]}
                  </span>
                  <span className="text-muted">{TIER_LABELS[p.targetTier]}</span>
                  <span className="flex" role="img" aria-label={`難易度 ${p.difficultyLevel} / 5`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        aria-hidden
                        className={cn('h-3 w-3', n <= p.difficultyLevel ? 'fill-amber-400 text-amber-400' : 'text-foreground/20')}
                      />
                    ))}
                  </span>
                </div>
                <h3 className="mt-3 font-serif text-base font-bold leading-snug">{p.title}</h3>
                <p className="mt-1 text-xs text-muted">{p.author}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-muted">
                  <span>{p.charCount.toLocaleString()}字</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden />
                    {formatSeconds(p.standardTimeSeconds)}
                  </span>
                  <span>選択 {p.choiceQuestionCount}問</span>
                  {p.descriptiveQuestionCount > 0 && <span>記述 {p.descriptiveQuestionCount}問</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
