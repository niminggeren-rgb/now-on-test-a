'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MockExamRecord } from '@/types/domain';

interface Point {
  label: string;
  examName: string;
  examDate: string;
  provider: string;
  score: number;
  maxScore: number;
  deviation: number;
}

function toPoints(exams: readonly MockExamRecord[]): Point[] {
  return [...exams]
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .map((e) => {
      const [, m, d] = e.examDate.split('-');
      return {
        label: `${Number(m)}/${Number(d)}`,
        examName: e.examName,
        examDate: e.examDate,
        provider: e.examProvider,
        score: e.modernJapaneseScore,
        maxScore: e.modernJapaneseMaxScore,
        deviation: e.deviationValue,
      };
    });
}

function ChartTooltip({
  active,
  payload,
  measure,
}: {
  active?: boolean;
  payload?: { payload?: Point }[];
  measure: 'score' | 'deviation';
}) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="rounded-md border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-medium">{p.examName}</div>
      <div className="text-muted">{p.provider} · {p.examDate}</div>
      <div className="mt-1 font-mono">
        {measure === 'score' ? `${p.score} / ${p.maxScore} 点` : `偏差値 ${p.deviation.toFixed(1)}`}
      </div>
    </div>
  );
}

function MiniLine({
  title,
  points,
  measure,
  color,
  domain,
  unit,
}: {
  title: string;
  points: Point[];
  measure: 'score' | 'deviation';
  color: string;
  domain: [number, number];
  unit: string;
}) {
  const dataKey = measure === 'score' ? 'score' : 'deviation';
  const summary = points.map((p) => `${p.label} ${measure === 'score' ? p.score : p.deviation}`).join('、');
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex items-baseline gap-2 text-xs">
        <span className="font-medium">{title}</span>
        <span className="text-muted">{unit}</span>
      </figcaption>
      <div className="h-52 w-full" role="img" aria-label={`${title}の推移。${summary}`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted))', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              domain={domain}
              tickCount={measure === 'score' ? 5 : Math.max(2, Math.round((domain[1] - domain[0]) / 5) + 1)}
              interval={0}
              tick={{ fill: 'hsl(var(--muted))', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<ChartTooltip measure={measure} />} cursor={{ stroke: 'hsl(var(--muted))', strokeDasharray: '3 3' }} />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 4, fill: color, stroke: 'hsl(var(--surface))', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: color, stroke: 'hsl(var(--surface))', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** 得点と偏差値は尺度が違うため、二軸にせず2つの小さなチャートに分けて並べる。 */
export function ScoreTrendChart({ exams }: { exams: readonly MockExamRecord[] }) {
  const points = toPoints(exams);
  if (points.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">模試の記録がありません。</p>;
  }
  const maxScore = Math.max(...points.map((p) => p.maxScore));
  const devs = points.map((p) => p.deviation);
  // 5刻みに丸め、軸の目盛りを揃える
  const devDomain: [number, number] = [Math.floor((Math.min(...devs) - 3) / 5) * 5, Math.ceil((Math.max(...devs) + 3) / 5) * 5];

  return (
    <div className="grid gap-6 md:grid-cols-2" data-testid="score-trend">
      <MiniLine title="現代文 得点" points={points} measure="score" color="var(--series-1)" domain={[0, maxScore]} unit="点" />
      <MiniLine title="偏差値" points={points} measure="deviation" color="var(--series-2)" domain={devDomain} unit="" />
    </div>
  );
}
