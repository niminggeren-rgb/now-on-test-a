import type { UnderlineSpan } from '@/types/domain';

export type MarkerKind = 'CONTRAST' | 'SUMMARY' | 'CAUSE';

export type TextSegment =
  | { kind: 'plain'; text: string }
  | { kind: 'underline'; text: string; underline: UnderlineSpan }
  | { kind: 'marker'; text: string; marker: MarkerKind };

/** 論理接続詞（逆接＝赤 / 要約・結論＝青 / 因果＝黄）。 */
export const MARKER_WORDS: Record<MarkerKind, readonly string[]> = {
  CONTRAST: ['しかし', 'だが', 'ところが', 'けれども', 'とはいえ', '一方で', '一方', '他方', 'これに対して', 'むしろ', 'かえって', 'にもかかわらず'],
  SUMMARY: ['つまり', 'すなわち', 'したがって', 'こうして', 'このように', '要するに', '結局'],
  CAUSE: ['なぜなら', 'だからこそ', 'だから', 'ゆえに', 'それゆえ', 'そのため'],
};

const MARKER_LOOKUP = new Map<string, MarkerKind>(
  (Object.entries(MARKER_WORDS) as [MarkerKind, readonly string[]][]).flatMap(([kind, words]) =>
    words.map((w): [string, MarkerKind] => [w, kind]),
  ),
);

// 長い語を優先してマッチさせる（「だからこそ」を「だから」より先に）
const MARKER_REGEX = new RegExp(
  [...MARKER_LOOKUP.keys()].sort((a, b) => b.length - a.length).join('|'),
  'g',
);

function splitMarkers(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKER_REGEX)) {
    const marker = MARKER_LOOKUP.get(m[0]);
    if (!marker || m.index === undefined) continue;
    if (m.index > last) out.push({ kind: 'plain', text: text.slice(last, m.index) });
    out.push({ kind: 'marker', text: m[0], marker });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'plain', text: text.slice(last) });
  return out;
}

/**
 * 段落テキストを「通常 / 傍線部 / 接続詞マーカー」に分割する。
 * 傍線部は本文中の最初の出現位置にだけ適用し、傍線部内部はマーカー処理しない。
 */
export function segmentParagraph(
  text: string,
  underlines: readonly UnderlineSpan[] = [],
  markersOn: boolean,
): TextSegment[] {
  const found = underlines
    .map((underline) => ({ underline, start: text.indexOf(underline.text) }))
    .filter((u) => u.start >= 0)
    .sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  const pushPlain = (chunk: string) => {
    if (!chunk) return;
    segments.push(...(markersOn ? splitMarkers(chunk) : [{ kind: 'plain', text: chunk } as const]));
  };

  for (const { underline, start } of found) {
    if (start < cursor) continue; // 重複する傍線部は無視
    pushPlain(text.slice(cursor, start));
    segments.push({ kind: 'underline', text: underline.text, underline });
    cursor = start + underline.text.length;
  }
  pushPlain(text.slice(cursor));
  return segments;
}
