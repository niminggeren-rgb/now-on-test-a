import { z } from 'zod';
import type { GradingRubricItem, QuestionItem } from '@/types/domain';

// ----------------------------------------------------------------------------
// 型 / スキーマ
// ----------------------------------------------------------------------------

export const rubricScoreSchema = z.object({
  rubricId: z.string(),
  element: z.string(),
  maxPoints: z.number(),
  earnedPoints: z.number(),
  comment: z.string(),
});

export const deductionSchema = z.object({
  /** 答案中の該当箇所の引用（全体に関わる場合は空文字） */
  quote: z.string(),
  issue: z.string(),
  severity: z.enum(['major', 'minor']),
});

/** クライアント/API 間で受け渡す最終的な添削結果。 */
export const descriptiveEvaluationSchema = z.object({
  totalScore: z.number().min(0).max(100),
  charCount: z.number().int().nonnegative(),
  rubricScores: z.array(rubricScoreSchema),
  deductions: z.array(deductionSchema),
  logicalLeaps: z.array(z.string()),
  rewriteSuggestion: z.string(),
  overallComment: z.string(),
  source: z.enum(['gemini', 'local']),
  /** AI 採点に失敗してローカル採点へ切り替えた場合などの注記 */
  notice: z.string().optional(),
  /** 添削後にのみ開示する模範解答（API が付与する） */
  modelAnswerText: z.string().optional(),
});
export type DescriptiveEvaluation = z.infer<typeof descriptiveEvaluationSchema>;
export type RubricScore = z.infer<typeof rubricScoreSchema>;
export type Deduction = z.infer<typeof deductionSchema>;

/** Gemini が返す JSON（信頼せず、検証・クランプしてから採用する）。 */
export const geminiRawEvaluationSchema = z.object({
  rubricScores: z.array(z.object({ rubricId: z.string(), earnedPoints: z.number(), comment: z.string().default('') })),
  deductions: z.array(deductionSchema).default([]),
  logicalLeaps: z.array(z.string()).default([]),
  rewriteSuggestion: z.string().default(''),
  overallComment: z.string().default(''),
});
export type GeminiRawEvaluation = z.infer<typeof geminiRawEvaluationSchema>;

// ----------------------------------------------------------------------------
// 共通ヘルパー
// ----------------------------------------------------------------------------

/** 原稿用紙の字数: 空白・改行を除いたコードポイント数。 */
export function countAnswerChars(text: string): number {
  return [...text.replace(/\s/g, '')].length;
}

const MIN_CHARS_DEFAULT = 350;

/** 字数に関する機械的な減点。上限超過は -10、大幅不足(245字未満)は -10、350字未満は -5。 */
export function lengthAdjustment(charCount: number, limit: number): Deduction | null {
  if (charCount > limit) {
    return { quote: '', issue: `字数制限（${limit}字）を超過しています（${charCount}字）`, severity: 'major' };
  }
  if (charCount < Math.floor(MIN_CHARS_DEFAULT * 0.7)) {
    return { quote: '', issue: `字数が大幅に不足しています（${charCount}字 / 目安${MIN_CHARS_DEFAULT}字以上）`, severity: 'major' };
  }
  if (charCount < MIN_CHARS_DEFAULT) {
    return { quote: '', issue: `字数がやや不足しています（${charCount}字 / 目安${MIN_CHARS_DEFAULT}字以上）`, severity: 'minor' };
  }
  return null;
}

function penaltyOf(d: Deduction | null): number {
  if (!d) return 0;
  return d.severity === 'major' ? 10 : 5;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : 0)));
}

function toneComment(score: number): string {
  if (score >= 85) return '論理の骨格がほぼ備わっています。表現の精度を詰めれば合格答案です。';
  if (score >= 60) return '主要な要素は押さえられていますが、一部の要素や因果のつながりが弱い箇所があります。';
  if (score >= 35) return '本文の対比構造の把握が部分的です。減点箇所を確認し、要素ごとに補いましょう。';
  return '設問が求める要素がほとんど書かれていません。まず本文の対比軸と筆者の結論を整理し直しましょう。';
}

// ----------------------------------------------------------------------------
// ローカル採点エンジン（GEMINI_API_KEY 未設定時 / AI 失敗時のフォールバック）
// ----------------------------------------------------------------------------

const OVERCLAIM_RE = /(すべて|全て|必ず|常に|一切|完全に|決して|絶対)/g;
const CONTRAST_RE = /(これに対し|に対して|一方|ではなく|しかし|だが|それとは逆)/;
const CONCLUSION_RE = /(したがって|よって|ゆえに|以上から|必要(だ|で)|べき)/;

function scoreRubricItem(item: GradingRubricItem, answer: string): { earned: number; hits: string[]; missing: string[] } {
  const hits = item.keywords.filter((k) => answer.includes(k));
  const missing = item.keywords.filter((k) => !answer.includes(k));
  // キーワードの6割に言及していれば満点、それ未満は比例配点
  const need = Math.max(1, Math.ceil(item.keywords.length * 0.6));
  const ratio = Math.min(1, hits.length / need);
  return { earned: Math.round(item.points * ratio), hits, missing };
}

export function gradeDescriptiveLocally(question: QuestionItem, answer: string, notice?: string): DescriptiveEvaluation {
  const rubric = question.gradingRubric ?? [];
  const limit = question.descriptiveCharLimit ?? 400;
  const charCount = countAnswerChars(answer);
  const body = answer.replace(/\s/g, '');

  const deductions: Deduction[] = [];
  const logicalLeaps: string[] = [];
  const rewriteLines: string[] = [];

  const rubricScores: RubricScore[] = rubric.map((item) => {
    const { earned, hits, missing } = scoreRubricItem(item, body);
    if (earned === 0) {
      deductions.push({ quote: '', issue: `「${item.element}」に当たる記述が見当たりません`, severity: 'major' });
      rewriteLines.push(`・${item.element}。「${item.keywords.slice(0, 3).join('」「')}」などを用いて1文で補う。`);
    } else if (earned < item.points) {
      deductions.push({
        quote: '',
        issue: `「${item.element}」の記述が不十分です（不足している着眼点: ${missing.slice(0, 3).join('・')}）`,
        severity: 'minor',
      });
      rewriteLines.push(`・${item.element}。「${missing.slice(0, 2).join('」「')}」に触れて具体化する。`);
    }
    return {
      rubricId: item.id,
      element: item.element,
      maxPoints: item.points,
      earnedPoints: earned,
      comment:
        hits.length > 0
          ? `言及できている着眼点: ${hits.join('・')}`
          : '該当する着眼点が答案中に確認できません。',
    };
  });

  for (const m of body.matchAll(OVERCLAIM_RE)) {
    const idx = m.index ?? 0;
    deductions.push({
      quote: body.slice(Math.max(0, idx - 8), idx + m[0].length + 8),
      issue: `「${m[0]}」は断定が強すぎます。本文のニュアンスを超える「言い過ぎ」になっていないか確認してください。`,
      severity: 'minor',
    });
    break; // 最初の1件のみ提示
  }

  if (body.length > 0 && !CONTRAST_RE.test(body)) {
    logicalLeaps.push('対比構造（Aではなく B／A に対して B）が接続表現で明示されていません。本文の二項対立を文の形で示してください。');
  }
  if (body.length > 0 && !CONCLUSION_RE.test(body)) {
    logicalLeaps.push('結論へ導く接続（したがって・よって 等）がなく、批判から筆者の主張への論理のつながりが読み取れません。');
  }

  const lengthDeduction = lengthAdjustment(charCount, limit);
  if (lengthDeduction) deductions.push(lengthDeduction);

  const raw = rubricScores.reduce((s, r) => s + r.earnedPoints, 0);
  const totalScore = clampInt(raw - penaltyOf(lengthDeduction), 0, 100);

  const rewriteSuggestion =
    rewriteLines.length > 0
      ? `次の要素を補うと得点が上がります。\n${rewriteLines.join('\n')}\n構成は「問題の指摘 → 対比（本来の姿）→ 結論（限定を付けて）」の順で、因果の向きを崩さずにまとめてください。`
      : '必要な要素は揃っています。各文の因果の向きと、「〜ではなく」といった限定表現が本文と一致しているかを最終確認してください。';

  return {
    totalScore,
    charCount,
    rubricScores,
    deductions,
    logicalLeaps,
    rewriteSuggestion,
    overallComment: toneComment(totalScore),
    source: 'local',
    ...(notice ? { notice } : {}),
  };
}

// ----------------------------------------------------------------------------
// Gemini 出力の正規化（スコアはモデルを信用せず、ルーブリックの範囲に収めて再計算する）
// ----------------------------------------------------------------------------

export function normalizeGeminiEvaluation(question: QuestionItem, answer: string, raw: GeminiRawEvaluation): DescriptiveEvaluation {
  const rubric = question.gradingRubric ?? [];
  const limit = question.descriptiveCharLimit ?? 400;
  const charCount = countAnswerChars(answer);

  const rubricScores: RubricScore[] = rubric.map((item) => {
    const given = raw.rubricScores.find((r) => r.rubricId === item.id);
    return {
      rubricId: item.id,
      element: item.element,
      maxPoints: item.points,
      earnedPoints: clampInt(given?.earnedPoints ?? 0, 0, item.points),
      comment: given?.comment ?? '採点コメントがありません。',
    };
  });

  const deductions = [...raw.deductions];
  const lengthDeduction = lengthAdjustment(charCount, limit);
  if (lengthDeduction) deductions.push(lengthDeduction);

  const totalScore = clampInt(rubricScores.reduce((s, r) => s + r.earnedPoints, 0) - penaltyOf(lengthDeduction), 0, 100);

  return {
    totalScore,
    charCount,
    rubricScores,
    deductions,
    logicalLeaps: raw.logicalLeaps,
    rewriteSuggestion: raw.rewriteSuggestion,
    overallComment: raw.overallComment || toneComment(totalScore),
    source: 'gemini',
  };
}
