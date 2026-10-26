'use client';

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { TrapRates } from '@/lib/analytics';

export const SERIES = {
  detect: { key: 'detectRate', label: '見破り率', color: 'var(--series-1)' },
  trapped: { key: 'trappedRate', label: '引っかかり率', color: 'var(--series-2)' },
} as const;

interface TooltipPayload {
  payload?: TrapRates;
}

function RadarTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium">{row.shortLabel}</div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: SERIES.detect.color }} aria-hidden />
        <span className="text-muted">{SERIES.detect.label}</span>
        <span className="ml-auto font-mono">{row.detectRate}%</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: SERIES.trapped.color }} aria-hidden />
        <span className="text-muted">{SERIES.trapped.label}</span>
        <span className="ml-auto font-mono">{row.trappedRate}%</span>
      </div>
      <div className="mt-1 font-mono text-[10px] text-muted">遭遇 {row.encountered} 回</div>
    </div>
  );
}

/** 6大トラップの「見破り率」と「引っかかり率」を重ねたレーダー。軸は 0–100% の1本のみ。 */
export function TrapRadarChart({ rates }: { rates: TrapRates[] }) {
  const summary = rates.map((r) => `${r.shortLabel}: 見破り${r.detectRate}% 引っかかり${r.trappedRate}%`).join('、');
  return (
    <div>
      <div className="h-[380px] w-full" role="img" aria-label={`トラップ別レーダーチャート。${summary}`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <RadarChart data={rates} outerRadius="70%" margin={{ top: 16, right: 24, bottom: 16, left: 24 }}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="shortLabel" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tickCount={3}
              tick={{ fill: 'hsl(var(--muted))', fontSize: 10 }}
              axisLine={false}
            />
            <Radar
              name={SERIES.detect.label}
              dataKey={SERIES.detect.key}
              stroke={SERIES.detect.color}
              strokeWidth={2}
              fill={SERIES.detect.color}
              fillOpacity={0.14}
              dot={{ r: 4, stroke: 'hsl(var(--surface))', strokeWidth: 2, fill: SERIES.detect.color }}
              isAnimationActive={false}
            />
            <Radar
              name={SERIES.trapped.label}
              dataKey={SERIES.trapped.key}
              stroke={SERIES.trapped.color}
              strokeWidth={2}
              fill={SERIES.trapped.color}
              fillOpacity={0.14}
              dot={{ r: 4, stroke: 'hsl(var(--surface))', strokeWidth: 2, fill: SERIES.trapped.color }}
              isAnimationActive={false}
            />
            <Tooltip content={<RadarTooltip />} cursor={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex justify-center gap-5 text-xs" aria-label="凡例">
        {Object.values(SERIES).map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
