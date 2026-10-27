import { TRAP_METADATA_MAP, type ActiveTrapType } from '@/types/domain';

/**
 * Reasoning Match: 生徒の消去理由（UI のタグ、または鉛筆OCRの推定）と選択肢の実際の傷を、API を使わずに照合する。
 * 「正解したか」とは別に「正しい理由で切れたか」を採点し、偶然の正解（LUCKY HIT）を見つける。
 */

export interface MatchChoice {
  optionNumber: number;
  isCorrectAnswer: boolean;
  actualTrapTypes: readonly ActiveTrapType[];
  flawSpan: string | null;
}

export interface MatchQuestion {
  questionNumberLabel: string;
  officialCorrectOption: number;
  studentInitialSelectedOption?: number | null;
  choices: readonly MatchChoice[];
  /** UI 入力が無いときに使う鉛筆OCRの痕跡 */
  blackPencilTraces?: readonly {
    optionNumber: number;
    isEliminatedBySlash: boolean;
    underlinedOrCrossedPhrases: readonly string[];
    inferredStudentTrapReason: ActiveTrapType | null;
  }[];
}

export interface StudentEliminationInput {
  optionNumber: number;
  selectedTrapType: ActiveTrapType | null;
  markedFlawText?: string | null;
}

export type OptionMatchStatus =
  | 'LOGICAL_HIT' // 誤答を正しいトラップ分類で消去
  | 'PARTIAL_HIT' // 誤答を消去し、傷の箇所だけ一致
  | 'LUCKY_ELIMINATION' // 誤答を消去したが理由がズレている
  | 'WRONG_ELIMINATION' // 正解を消去してしまった
  | 'FATAL_KEEP' // 誤答を残した / 正解を選び切れなかった
  | 'CORRECT_SELECTION'; // 正解を残して選んだ

export interface OptionReasoningVerdict {
  optionNumber: number;
  status: OptionMatchStatus;
  badgeText: string;
  studentTrapType: ActiveTrapType | null;
  actualTrapTypes: readonly ActiveTrapType[];
  actualFlawSpan: string | null;
  feedbackMessage: string;
  scoreEarned: number;
  maxPossibleScore: number;
}

export interface QuestionReasoningMatchSummary {
  questionNumberLabel: string;
  isAnswerCorrect: boolean;
  /** 正解かつ誤答の75%以上を正しい理由で切った */
  isLogicalHitMaster: boolean;
  /** 論理的看破度 0〜100 */
  logicalHitScore: number;
  /** 正解だが、誤答の半数以上は理由が合っていない */
  luckyHitDetected: boolean;
  verdicts: OptionReasoningVerdict[];
  overallDiagnosis: string;
}

const MAX = 20;
const SCORE_KEPT_BUT_UNSELECTED = 5;
const SCORE_PARTIAL = 14;
const SCORE_LUCKY = 6;

const label = (t: ActiveTrapType) => TRAP_METADATA_MAP[t].shortLabel;

function overlaps(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a) && Boolean(b) && (a!.includes(b!) || b!.includes(a!));
}

export function evaluateReasoningMatch(
  question: MatchQuestion,
  studentSelectedOption: number | null,
  studentEliminations: readonly StudentEliminationInput[],
): QuestionReasoningMatchSummary {
  const eliminations = new Map<number, StudentEliminationInput>(studentEliminations.map((e) => [e.optionNumber, e]));
  if (eliminations.size === 0) {
    for (const t of question.blackPencilTraces ?? []) {
      if (t.isEliminatedBySlash) {
        eliminations.set(t.optionNumber, {
          optionNumber: t.optionNumber,
          selectedTrapType: t.inferredStudentTrapReason,
          markedFlawText: t.underlinedOrCrossedPhrases[0] ?? null,
        });
      }
    }
  }

  const chosen = studentSelectedOption ?? question.studentInitialSelectedOption ?? null;
  const isAnswerCorrect = chosen === question.officialCorrectOption;

  const verdicts: OptionReasoningVerdict[] = [];
  let earned = 0;
  let hits = 0;
  let wrongChoices = 0;

  for (const choice of question.choices) {
    const elim = eliminations.get(choice.optionNumber);
    const base = {
      optionNumber: choice.optionNumber,
      studentTrapType: elim?.selectedTrapType ?? null,
      actualTrapTypes: choice.actualTrapTypes,
      actualFlawSpan: choice.flawSpan,
      maxPossibleScore: MAX,
    };

    if (choice.isCorrectAnswer) {
      if (elim) {
        verdicts.push({
          ...base,
          status: 'WRONG_ELIMINATION',
          badgeText: 'MISFIRE（正解を消去）',
          feedbackMessage: `正解の選択肢${choice.optionNumber}を「${elim.selectedTrapType ? label(elim.selectedTrapType) : '傷あり'}」と誤認して消去しています。本文の言い換えを傷と見誤らないようにしましょう。`,
          scoreEarned: 0,
        });
      } else if (chosen === choice.optionNumber) {
        earned += MAX;
        verdicts.push({
          ...base,
          status: 'CORRECT_SELECTION',
          badgeText: 'TARGET LOCKED',
          feedbackMessage: `正解の選択肢${choice.optionNumber}を消さずに残して選べました。`,
          scoreEarned: MAX,
        });
      } else {
        earned += SCORE_KEPT_BUT_UNSELECTED;
        verdicts.push({
          ...base,
          status: 'FATAL_KEEP',
          badgeText: 'UNSELECTED',
          feedbackMessage: '消去は免れましたが、最終解答として選べませんでした。',
          scoreEarned: SCORE_KEPT_BUT_UNSELECTED,
        });
      }
      continue;
    }

    wrongChoices++;
    const actualLabels = choice.actualTrapTypes.map(label).join(' / ');

    if (!elim) {
      verdicts.push({
        ...base,
        status: 'FATAL_KEEP',
        badgeText: 'TRAP MISSED',
        feedbackMessage: `選択肢${choice.optionNumber}の傷「${choice.flawSpan ?? '該当箇所'}」（${actualLabels}）を見落として残しています。`,
        scoreEarned: 0,
      });
    } else if (elim.selectedTrapType !== null && choice.actualTrapTypes.includes(elim.selectedTrapType)) {
      hits++;
      earned += MAX;
      verdicts.push({
        ...base,
        status: 'LOGICAL_HIT',
        badgeText: 'LOGICAL HIT!',
        feedbackMessage: `「${choice.flawSpan ?? ''}」が【${TRAP_METADATA_MAP[elim.selectedTrapType].label}】であることを見抜いています。`,
        scoreEarned: MAX,
      });
    } else if (overlaps(choice.flawSpan, elim.markedFlawText)) {
      hits += 0.5;
      earned += SCORE_PARTIAL;
      verdicts.push({
        ...base,
        status: 'PARTIAL_HIT',
        badgeText: 'PARTIAL HIT（箇所一致）',
        feedbackMessage: `傷の場所「${choice.flawSpan}」は捉えていますが、分類は【${actualLabels}】です。`,
        scoreEarned: SCORE_PARTIAL,
      });
    } else {
      earned += SCORE_LUCKY;
      const mine = elim.selectedTrapType ? label(elim.selectedTrapType) : '理由未指定';
      verdicts.push({
        ...base,
        status: 'LUCKY_ELIMINATION',
        badgeText: 'REASON MISMATCH',
        feedbackMessage: `消去は成功していますが理由がズレています（あなたの判定: ${mine} → 実際の傷: 【${actualLabels}】「${choice.flawSpan ?? ''}」）。`,
        scoreEarned: SCORE_LUCKY,
      });
    }
  }

  const possible = question.choices.length * MAX;
  const logicalHitScore = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  const ratio = wrongChoices > 0 ? hits / wrongChoices : 0;
  const isLogicalHitMaster = isAnswerCorrect && ratio >= 0.75;
  const luckyHitDetected = isAnswerCorrect && ratio < 0.5;

  let overallDiagnosis: string;
  if (isLogicalHitMaster) {
    overallDiagnosis = 'LOGICAL MASTER: ほとんどの誤答の傷を、正しい理由で撃ち抜けています。再現性の高い解き方です。';
  } else if (luckyHitDetected) {
    overallDiagnosis = 'LUCKY HIT: 解答は合っていますが、消去の理由が実際の傷と一致していません。本番で同型の罠に落ちる危険があります。';
  } else if (!isAnswerCorrect && ratio >= 0.5) {
    overallDiagnosis = 'CLOSE CALL: 絞り込みは論理的ですが、最後の1つで本文の言い換えを傷と誤認しています。';
  } else {
    overallDiagnosis = 'NEEDS WORK: 傷を特定する基準があいまいです。解説の「解法の思考プロセス」で消去の順序を確認しましょう。';
  }

  return { questionNumberLabel: question.questionNumberLabel, isAnswerCorrect, isLogicalHitMaster, logicalHitScore, luckyHitDetected, verdicts, overallDiagnosis };
}
