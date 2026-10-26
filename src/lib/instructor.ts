import { toTrapRates } from '@/lib/analytics';
import { TRAP_PRESCRIPTIONS } from '@/lib/analytics';
import { TIER_LABELS } from '@/lib/labels';
import { TRAP_METADATA_MAP, type ActiveTrapType, type TrapWeaknessStat } from '@/types/domain';
import type { StudentRecord } from '@/types/instructor';

/**
 * 「一般的な生徒」の引っかかり率の基準値（0〜1）。倍率算出の参照用の定数であり、
 * 実測の母集団統計ではない（デモ用の目安）。実運用では組織内の実測値に置き換える。
 */
export const POPULATION_TRAPPED_RATE: Record<ActiveTrapType, number> = {
  OVERSTATEMENT: 0.12,
  CAUSAL_REVERSAL: 0.18,
  CONCEPT_SWAP: 0.16,
  UNMENTIONED: 0.12,
  SUBJECT_OBJECT_FLIP: 0.15,
  PARTIAL_CONTRADICTION: 0.22,
};

const MIN_SAMPLE = 10;
const FOCUS_MULTIPLIER = 1.5;
const STRENGTH_DETECT_RATE = 65;

/** 指導者向けの具体的な指導上の指示。 */
const TEACHING_INSTRUCTIONS: Record<ActiveTrapType, string> = {
  OVERSTATEMENT: '選択肢の副詞・限定語（完全に・常に・一切）に必ず印を付けさせ、本文に同じ強さの根拠を指せるかを口頭で確認すること。',
  CAUSAL_REVERSAL: '傍線部ごとに「A→B」の矢印を余白に書かせ、選択肢の因果と向きが一致するかを答えさせること。',
  CONCEPT_SWAP: '読解の段階で対比軸を2列の表に整理させ、選択肢の各語がどちらの列に属するかを仕分けさせること。',
  UNMENTIONED: '残す選択肢には必ず本文の根拠箇所に線を引かせ、指せない場合は「言及なし」として消去させること。',
  SUBJECT_OBJECT_FLIP: '選択肢の主語に「誰が」と問わせ、本文で同じ主体がその動作をしているかを確認させること。',
  PARTIAL_CONTRADICTION: '指導時は選択肢をスラッシュで3節に区切るルールを徹底させ、最後の述語まで全ての節を本文と照合させること。',
};

const STRENGTH_PHRASES: Record<ActiveTrapType, string> = {
  OVERSTATEMENT: '極端な断定表現はほぼ確実に見破れており',
  CAUSAL_REVERSAL: '因果の向きを正確に追えており',
  CONCEPT_SWAP: '本文の二項対立を把握するのは速く',
  UNMENTIONED: '本文外の常識の混入を見分けられており',
  SUBJECT_OBJECT_FLIP: '主語・動作主を正確に追えており',
  PARTIAL_CONTRADICTION: '選択肢を最後まで丁寧に照合できており',
};

export interface FocusTrap {
  trap: ActiveTrapType;
  /** 一般的な生徒に対する引っかかり率の倍率 */
  multiplier: number;
  trappedRate: number;
}

export interface TeachingSuggestion {
  focusTraps: FocusTrap[];
  strengthTrap: ActiveTrapType | null;
  /** 指導者向けの診断文 */
  narrative: string;
  actions: string[];
}

export function analyzeFocusTraps(stats: readonly TrapWeaknessStat[]): FocusTrap[] {
  return stats
    .filter((s) => s.encounteredCount >= MIN_SAMPLE)
    .map((s) => {
      const rate = s.trappedCount / s.encounteredCount;
      return {
        trap: s.trapType,
        multiplier: Math.round((rate / POPULATION_TRAPPED_RATE[s.trapType]) * 10) / 10,
        trappedRate: Math.round(rate * 1000) / 10,
      };
    })
    .sort((a, b) => b.multiplier - a.multiplier);
}

export function generateTeachingSuggestion(student: StudentRecord): TeachingSuggestion {
  const ranked = analyzeFocusTraps(student.stats);
  const focusTraps = ranked.filter((f) => f.multiplier >= FOCUS_MULTIPLIER).slice(0, 2);
  const effectiveFocus = focusTraps.length > 0 ? focusTraps : ranked.slice(0, 1);

  const rates = toTrapRates(student.stats);
  const strength = [...rates]
    .filter((r) => r.encountered >= MIN_SAMPLE && r.detectRate >= STRENGTH_DETECT_RATE)
    .sort((a, b) => b.detectRate - a.detectRate || a.trappedRate - b.trappedRate)[0];

  const lead = `${student.name}（${student.grade}・${student.targetUniversity}志望）：`;
  const strengthText = strength ? `${STRENGTH_PHRASES[strength.trapType]}、` : '';

  let narrative: string;
  if (focusTraps.length === 0) {
    const top = effectiveFocus[0];
    narrative = top
      ? `${lead}${strengthText}一般的な水準から大きく外れた弱点は見られません。相対的に最も引っかかりやすいのは「${TRAP_METADATA_MAP[top.trap].shortLabel}」（引っかかり率 ${top.trappedRate}%）です。${TEACHING_INSTRUCTIONS[top.trap]}`
      : `${lead}診断に十分な演習データ（各トラップ${MIN_SAMPLE}回以上）がまだありません。`;
  } else {
    const parts = focusTraps.map(
      (f) => `「${TRAP_METADATA_MAP[f.trap].shortLabel}」に引っかかる傾向が通常の${f.multiplier.toFixed(1)}倍（引っかかり率 ${f.trappedRate}%）`,
    );
    const first = focusTraps[0]!;
    narrative = `${lead}${strengthText}一方で、${parts.join('、')}と高くなっています。${TEACHING_INSTRUCTIONS[first.trap]}`;
  }

  const actions = effectiveFocus.flatMap((f) => [
    `【${TRAP_METADATA_MAP[f.trap].shortLabel}】${TEACHING_INSTRUCTIONS[f.trap]}`,
    `【${TRAP_METADATA_MAP[f.trap].shortLabel}・生徒向けの合言葉】${TRAP_PRESCRIPTIONS[f.trap].drill}`,
  ]);
  if (student.avgSeconds < 130 && student.accuracy < 65) {
    actions.push('解答が速い割に正答率が伸びていません。確定前に「最後の述語まで照合したか」を声に出して確認させてください。');
  } else if (student.avgSeconds > 190) {
    actions.push('1問あたりの時間が長めです。消去の根拠を余白に1行で残す書き方に固定し、迷いの時間を短縮させてください。');
  }
  actions.push(`志望ティア（${TIER_LABELS[student.targetTier]}）に合わせ、苦手トラップ集中特訓モードを週3回以上実施させてください。`);

  return { focusTraps: effectiveFocus, strengthTrap: strength?.trapType ?? null, narrative, actions };
}
