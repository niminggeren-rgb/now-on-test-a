import { ACTIVE_TRAP_TYPES } from '@/lib/scoring';
import { TRAP_METADATA_MAP, type ActiveTrapType, type AnswerLog, type TrapWeaknessStat } from '@/types/domain';

export interface TrapRates {
  trapType: ActiveTrapType;
  shortLabel: string;
  encountered: number;
  /** 最終解答として選んでしまった率 (%) */
  trappedRate: number;
  /** 消去時にトラップ種別まで言い当てた率 (%) */
  detectRate: number;
  weaknessScore: number;
}

const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export function toTrapRates(stats: readonly TrapWeaknessStat[]): TrapRates[] {
  return ACTIVE_TRAP_TYPES.map((trapType) => {
    const s = stats.find((x) => x.trapType === trapType);
    const encountered = s?.encounteredCount ?? 0;
    return {
      trapType,
      shortLabel: TRAP_METADATA_MAP[trapType].shortLabel,
      encountered,
      trappedRate: pct(s?.trappedCount ?? 0, encountered),
      detectRate: pct(s?.correctlyTaggedCount ?? 0, encountered),
      weaknessScore: s?.weaknessScore ?? 0,
    };
  });
}

export interface Kpis {
  /** 論理消去精度: トラップ種別を言い当てた率 (%) */
  logicPrecision: number | null;
  /** 直近ログの正答率 (%) */
  accuracy: number | null;
  accuracySample: number;
  /** 平均解答スピード（秒/問） */
  avgSeconds: number | null;
  worstTrap: TrapWeaknessStat | null;
}

export function computeKpis(stats: readonly TrapWeaknessStat[], logs: readonly AnswerLog[]): Kpis {
  const encountered = stats.reduce((n, s) => n + s.encounteredCount, 0);
  const tagged = stats.reduce((n, s) => n + s.correctlyTaggedCount, 0);
  const mc = logs.filter((l) => l.selectedChoiceLabel !== null);
  const worstTrap =
    [...stats].filter((s) => s.encounteredCount > 0).sort((a, b) => b.weaknessScore - a.weaknessScore)[0] ?? null;
  return {
    logicPrecision: encountered > 0 ? pct(tagged, encountered) : null,
    accuracy: mc.length > 0 ? pct(mc.filter((l) => l.isCorrect).length, mc.length) : null,
    accuracySample: mc.length,
    avgSeconds: mc.length > 0 ? Math.round(mc.reduce((n, l) => n + l.timeSpentMs, 0) / mc.length / 1000) : null,
    worstTrap,
  };
}

export type Severity = 'critical' | 'caution' | 'good';

export function severityOf(score: number): Severity {
  if (score >= 40) return 'critical';
  if (score >= 25) return 'caution';
  return 'good';
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: '要注意',
  caution: '注意',
  good: '良好',
};

/** トラップ別の「なぜ引っかかるのか」の論理処方箋（静的な教材知識）。 */
export const TRAP_PRESCRIPTIONS: Record<ActiveTrapType, { why: string; drill: string }> = {
  OVERSTATEMENT: {
    why: '「完全に」「常に」「一切」といった強い語が、本文の「〜がちだ」「〜やすい」という傾向表現を全称命題へ広げていることに気づけていません。',
    drill: '選択肢の副詞・限定語に印を付け、本文に同じ強さの根拠があるかを確認してから残す。',
  },
  CAUSAL_REVERSAL: {
    why: '「〜ために」「〜によって」の前後を内容の近さで読み、本文の矢印（原因→結果）の向きを照合しないまま選んでいます。',
    drill: '傍線部ごとに「A→B」を余白に書き出し、選択肢の因果と矢印の向きが同じか確かめる。',
  },
  CONCEPT_SWAP: {
    why: '本文の二項対立（A群／B群）のキーワードが選択肢内で入れ替わっていても、語の雰囲気で「合っている」と判断してしまいます。',
    drill: '読解時に対比軸を2列で整理し、選択肢の各語がどちらの列に属するかを仕分けて照合する。',
  },
  UNMENTIONED: {
    why: '一般常識として正しそうな内容に引かれ、本文に根拠箇所を指せるかの確認を省いています。',
    drill: '残す選択肢には必ず本文の根拠箇所に線を引く。指せなければ「言及なし」として消去する。',
  },
  SUBJECT_OBJECT_FLIP: {
    why: '述語に対する主語・動作主が、筆者の立場か批判対象の一般論かを区別せずに読んでいます。',
    drill: '選択肢の主語に「誰が」と問い、本文で同じ主体がその動作をしているかを確認する。',
  },
  PARTIAL_CONTRADICTION: {
    why: '前半が本文通りだと安心して、末尾の述語や修飾語まで照合せずに飛びついています。',
    drill: '選択肢を「／」で3〜4節に区切り、最後の述語まで全ての節を本文と照合してから残す。',
  },
};

export interface Prescription {
  trapType: ActiveTrapType;
  severity: Severity;
  why: string;
  drill: string;
  /** 実績に基づく説明文 */
  evidence: string;
}

export function buildPrescription(stat: TrapWeaknessStat): Prescription {
  const rates = toTrapRates([stat]).find((r) => r.trapType === stat.trapType);
  if (!rates) throw new Error(`unknown trap type: ${stat.trapType}`);
  const base = TRAP_PRESCRIPTIONS[stat.trapType];
  const evidence =
    stat.encounteredCount === 0
      ? 'まだこのトラップに遭遇した記録がありません。'
      : `これまで${stat.encounteredCount}回遭遇し、${stat.trappedCount}回は最終解答として選んでしまいました（引っかかり率 ${rates.trappedRate}%）。トラップ種別を言い当てられたのは${stat.correctlyTaggedCount}回（見破り率 ${rates.detectRate}%）です。`;
  return { trapType: stat.trapType, severity: severityOf(stat.weaknessScore), why: base.why, drill: base.drill, evidence };
}
