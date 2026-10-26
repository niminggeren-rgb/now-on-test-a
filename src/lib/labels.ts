import type { PassageTheme, TargetTier } from '@/types/domain';

export const THEME_LABELS: Record<PassageTheme, string> = {
  PHILOSOPHY: '哲学・思想',
  SOCIOLOGY: '社会学',
  AESTHETICS: '美学・身体論',
  LINGUISTICS: '言語論',
  SCIENCE_ETHICS: '科学技術・倫理',
  CULTURE: '文化論',
};

export const TIER_LABELS: Record<TargetTier, string> = {
  MARCH: 'MARCH',
  SOKEI: '早慶',
  NATIONAL_HARD: '難関国公立',
  TOKYO_KYOTO: '旧帝大・東京一工',
};

/** 一覧フィルタ用の志望校ティア区分 */
export type TierFilter = 'ALL' | 'MARCH' | 'SOKEI' | 'NATIONAL';

export const TIER_FILTER_LABELS: Record<TierFilter, string> = {
  ALL: 'すべて',
  MARCH: 'MARCH',
  SOKEI: '早慶',
  NATIONAL: '難関国公立',
};

export function matchesTierFilter(tier: TargetTier, filter: TierFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'NATIONAL') return tier === 'NATIONAL_HARD' || tier === 'TOKYO_KYOTO';
  return tier === filter;
}

export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
