import { AI_TRAP_TO_DOMAIN } from '@/lib/import-material';
import { WEAKNESS_TRAPS } from '@/lib/exam-diagnosis';
import type { TrapWeaknessScores } from '@/lib/repositories/customMaterialRepository';
import { TRAP_METADATA_MAP } from '@/types/domain';

const CX = 160;
const CY = 125;
const R = 80;

function vertex(idx: number, ratio: number): [number, number] {
  const angle = (Math.PI * 2 * idx) / WEAKNESS_TRAPS.length - Math.PI / 2;
  return [CX + R * ratio * Math.cos(angle), CY + R * ratio * Math.sin(angle)];
}

const toPoints = (ratios: number[]) => ratios.map((r, i) => vertex(i, r).join(',')).join(' ');

/** 5大トラップの弱点レーダー（値が大きいほど要注意）。色はテーマトークン経由。 */
export function WeaknessRadar({ scores }: { scores: TrapWeaknessScores }) {
  const ratios = WEAKNESS_TRAPS.map((k) => Math.min(100, Math.max(0, scores[k])) / 100);
  const summary = WEAKNESS_TRAPS.map(
    (k) => `${TRAP_METADATA_MAP[AI_TRAP_TO_DOMAIN[k]].shortLabel} ${scores[k]}`,
  ).join('、');

  return (
    <div className="w-full">
      <svg viewBox="0 0 320 250" role="img" aria-label={`5大トラップ弱点レーダー: ${summary}`} className="mx-auto h-auto w-full max-w-sm">
        {[0.25, 0.5, 0.75, 1].map((scale) => (
          <polygon
            key={scale}
            points={toPoints(WEAKNESS_TRAPS.map(() => scale))}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="1"
          />
        ))}
        {WEAKNESS_TRAPS.map((k, i) => {
          const [x, y] = vertex(i, 1);
          return <line key={k} x1={CX} y1={CY} x2={x} y2={y} stroke="hsl(var(--border))" strokeWidth="1" />;
        })}
        <polygon
          points={toPoints(ratios)}
          fill="hsl(var(--trap-overstatement) / 0.28)"
          stroke="hsl(var(--trap-overstatement))"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {WEAKNESS_TRAPS.map((k, i) => {
          const [x, y] = vertex(i, 1.22);
          const anchor = x < CX - 5 ? 'end' : x > CX + 5 ? 'start' : 'middle';
          return (
            <text key={k} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fill-muted text-[10px]">
              {TRAP_METADATA_MAP[AI_TRAP_TO_DOMAIN[k]].shortLabel}
            </text>
          );
        })}
      </svg>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {WEAKNESS_TRAPS.map((k) => (
          <div key={k} className="flex items-center justify-between">
            <dt className="text-muted">{TRAP_METADATA_MAP[AI_TRAP_TO_DOMAIN[k]].shortLabel}</dt>
            <dd className="font-mono font-bold text-rose-400">{scores[k]} pt</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
