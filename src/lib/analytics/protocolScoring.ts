import {
  OPTION_TRAP_TYPES,
  PROTOCOL_STEP_IDS,
  SIX_MAJOR_TRAPS,
  VERNACULAR_PROTOCOL_STEPS,
  type AttemptStepScores,
  type OptionTrapType,
  type ProtocolStepId,
  type ProtocolWeaknessMatrix,
  type QuestionAttemptEvaluationInput,
  type TrapFailureStats,
} from '@/types/protocol';

/** 直近の成績を重く見る指数移動平均の係数（初回の計測は平均を取らず、そのまま採用する） */
const EMA_ALPHA = 0.25;

export function emptyTrapStats(): TrapFailureStats {
  return Object.fromEntries(
    OPTION_TRAP_TYPES.map((t) => [t, { encountered: 0, failed: 0, failureRate: 0 }]),
  ) as TrapFailureStats;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Step 3: 生徒が参照した段落と正解の根拠段落の一致度（0〜100）。
 * 根拠段落ごとに、ぴったり参照で 1、隣接段落の参照で 0.4 の点を与え（再現率）、
 * 根拠から離れた段落を多く参照しているほど減点する。段落を一つも参照していなければ 20。
 */
export function calculateStep3NavigationAccuracy(studentParagraphs: number[], correctParagraphs: number[]): number {
  const correct = [...new Set(correctParagraphs)];
  if (correct.length === 0) return 100;
  if (studentParagraphs.length === 0) return 20;

  const student = new Set(studentParagraphs);
  let hit = 0;
  for (const p of correct) {
    if (student.has(p)) hit += 1;
    else if (student.has(p - 1) || student.has(p + 1)) hit += 0.4;
  }
  const recall = hit / correct.length;
  const stray = [...student].filter((s) => !correct.some((c) => Math.abs(c - s) <= 1)).length;
  const precisionFactor = correct.length / (correct.length + stray);
  return round1(Math.min(100, Math.max(0, recall * precisionFactor * 100)));
}

/**
 * 「その Step の弱点が表に出やすいトラップ」に引っかかったかで Step を推定する（直接計測が無いとき用）。
 * 該当トラップが選択肢に含まれていなければ計測できないので null。
 * - Step 1: すり替え（二項対立の混同）
 * - Step 2: 主客転倒（傍線部の主述の取り違え）
 * - Step 3: 局所矛盾・言及なし（根拠箇所に当たっていない）
 */
function proxyStepScore(input: QuestionAttemptEvaluationInput, relevant: readonly OptionTrapType[]): number | null {
  if (!input.allChoicesTraps.some((t) => relevant.includes(t))) return null;
  if (input.isCorrect) return 100;
  return input.selectedChoiceTrap && relevant.includes(input.selectedChoiceTrap) ? 0 : 100;
}

const clamp100 = (n: number) => Math.min(100, Math.max(0, n));

/** 1問の結果から、各 Step の今回のスコア（0〜100。計測できない Step は null）を算出する */
export function evaluateSingleAttemptStepScores(input: QuestionAttemptEvaluationInput): AttemptStepScores {
  const step1 =
    input.step1BinaryMatchAccuracy != null
      ? clamp100(input.step1BinaryMatchAccuracy * 100)
      : proxyStepScore(input, ['substitution']);
  const step2 =
    input.step2DeconstructAccuracy != null
      ? clamp100(input.step2DeconstructAccuracy * 100)
      : proxyStepScore(input, ['subject_object_inversion']);
  const step3 = input.correctEvidenceParagraphs
    ? calculateStep3NavigationAccuracy(input.studentReferencedParagraphs ?? [], input.correctEvidenceParagraphs)
    : proxyStepScore(input, ['local_contradiction', 'unmentioned']);

  // Step 4: 正誤を土台に、選択肢を節分割して消去した度合いで加点する
  const quality = Math.min(1, Math.max(0, input.slashSegmentationQuality));
  const step4 = clamp100((input.isCorrect ? 95 : 25) * 0.8 + quality * 20);

  return {
    step1Delta: step1 === null ? null : round1(step1),
    step2Delta: step2 === null ? null : round1(step2),
    step3Delta: step3 === null ? null : round1(step3),
    step4Delta: round1(step4),
  };
}

function blend(prev: number | null, delta: number | null): number | null {
  if (delta === null) return prev;
  if (prev === null) return delta;
  return round1(prev * (1 - EMA_ALPHA) + delta * EMA_ALPHA);
}

/** 既存のマトリクス（無ければ null）に1問分の結果を取り込み、最新のマトリクスと処方箋を返す */
export function computeUpdatedWeaknessMatrix(
  current: ProtocolWeaknessMatrix | null,
  input: QuestionAttemptEvaluationInput,
): { updatedMatrix: ProtocolWeaknessMatrix; attemptStepScores: AttemptStepScores } {
  const attemptStepScores = evaluateSingleAttemptStepScores(input);

  const step1MacroScore = blend(current?.step1MacroScore ?? null, attemptStepScores.step1Delta);
  const step2DeconstructScore = blend(current?.step2DeconstructScore ?? null, attemptStepScores.step2Delta);
  const step3NavigationScore = blend(current?.step3NavigationScore ?? null, attemptStepScores.step3Delta);
  const step4EliminationScore = blend(current?.step4EliminationScore ?? null, attemptStepScores.step4Delta) ?? attemptStepScores.step4Delta;

  const scores: Record<ProtocolStepId, number | null> = {
    STEP_1: step1MacroScore,
    STEP_2: step2DeconstructScore,
    STEP_3: step3NavigationScore,
    STEP_4: step4EliminationScore,
  };
  // 計測済みの Step の中で最も低いもの
  const measured = PROTOCOL_STEP_IDS.filter((s) => scores[s] !== null);
  const weakestStep = measured.reduce((a, b) => (scores[b]! < scores[a]! ? b : a), measured[0] ?? 'STEP_4');

  // トラップ統計: 遭遇は1問につき種類ごとに1回、失点は選んでしまったトラップに1回
  const trapStats = structuredClone(current?.trapStats ?? emptyTrapStats());
  const encountered = new Set<OptionTrapType>(input.allChoicesTraps);
  if (!input.isCorrect && input.selectedChoiceTrap) encountered.add(input.selectedChoiceTrap);
  for (const t of encountered) trapStats[t].encountered += 1;
  if (!input.isCorrect && input.selectedChoiceTrap) trapStats[input.selectedChoiceTrap].failed += 1;

  // 失点率。遭遇が少ない間に1回で100%になりすぎないよう、遭遇2回までは重みを下げて最頻失点を選ぶ
  let mostFrequentTrap: OptionTrapType | null = null;
  let best = 0;
  for (const t of OPTION_TRAP_TYPES) {
    const s = trapStats[t];
    s.failureRate = s.encountered > 0 ? Math.round((s.failed / s.encountered) * 100) : 0;
    const weighted = s.failureRate * Math.min(1, s.encountered / 2);
    if (weighted > best) {
      best = weighted;
      mostFrequentTrap = t;
    }
  }

  const updatedMatrix: ProtocolWeaknessMatrix = {
    userId: input.userId,
    totalAttempts: (current?.totalAttempts ?? 0) + 1,
    step1MacroScore,
    step2DeconstructScore,
    step3NavigationScore,
    step4EliminationScore,
    weakestStep,
    trapStats,
    mostFrequentTrap,
    clinicalPrescription: generateClinicalPrescription(weakestStep, scores[weakestStep] ?? 0, mostFrequentTrap, mostFrequentTrap ? trapStats[mostFrequentTrap].failureRate : 0),
    updatedAt: new Date().toISOString(),
  };
  return { updatedMatrix, attemptStepScores };
}

/** 講師カルテ・AIメンターに渡す処方箋テキスト */
export function generateClinicalPrescription(
  weakestStep: ProtocolStepId,
  weakestScore: number,
  trap: OptionTrapType | null,
  trapFailureRate: number,
): string {
  const meta = VERNACULAR_PROTOCOL_STEPS[weakestStep];
  const score = Math.round(weakestScore);
  const diagnoses: Record<ProtocolStepId, string> = {
    STEP_1: `【全体構造スキャン不全（スコア ${score}）】本文の二項対立（A概念 vs B概念）を固定する前に設問へ進んでいます。導入段落で批判対象Aと筆者の主張Bを左右に分けてメモする習慣をつけましょう。`,
    STEP_2: `【傍線部解体不全（スコア ${score}）】傍線部内の指示語や主述関係を曖昧にしたまま選択肢を見ています。本文に戻る前に「指示語の特定」と「理由か換言かの確定」を行いましょう。`,
    STEP_3: `【根拠ナビゲーション不全（スコア ${score}）】論理マーカー（しかし・つまり・したがって）を手がかりにせず、根拠から外れた箇所を見ています。逆接・換言マーカーの直後1文に線を引く練習が有効です。`,
    STEP_4: `【選択肢の節分割・消去不全（スコア ${score}）】選択肢を1文まるごと雰囲気で読んでいる可能性があります。全選択肢を「前件 / 因果結節 / 後件」の3節にスラッシュ分割してから消去しましょう。`,
  };
  const trapPart = trap && trapFailureRate > 0
    ? ` 選択肢の消去では「${SIX_MAJOR_TRAPS[trap].label}」で失点しやすく（失点率 ${trapFailureRate}%）、確認点は「${SIX_MAJOR_TRAPS[trap].checkPoint}」です。`
    : '';
  return `${diagnoses[weakestStep]}${trapPart} まず ${meta.id}（${meta.japaneseTitle}）の型を優先して矯正してください。`;
}
