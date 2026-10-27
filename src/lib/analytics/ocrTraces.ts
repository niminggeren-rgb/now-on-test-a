import type { ClassifyAndOcrResult } from '@/app/api/ai/classify-and-ocr/route';
import {
  DOMAIN_TO_PROTOCOL_TRAP,
  type OptionTrapType,
  type ProtocolStepId,
  type StudentStep4TraceLog,
} from '@/types/protocol';

type Analysis = ClassifyAndOcrResult['analysis'];

const MARK_FROM_API = {
  CORRECT_CIRCLE: 'correct_circle',
  INCORRECT_CROSS: 'incorrect_cross',
  PARTIAL_TRIANGLE: 'triangle_partial',
  NONE: 'incorrect_cross',
} as const;

/** 間違えたトラップから、ボトルネックだった Step を推定する */
function inferWeakStep(isCorrect: boolean, trap: OptionTrapType | undefined): ProtocolStepId {
  if (isCorrect || !trap) return 'STEP_4';
  if (trap === 'substitution') return 'STEP_1';
  if (trap === 'subject_object_inversion') return 'STEP_2';
  if (trap === 'local_contradiction' || trap === 'unmentioned') return 'STEP_3';
  return 'STEP_4';
}

/** Stage 2 の解析結果（鉛筆/赤ペン分離済み）を、設問ごとの Step 4 痕跡ログに変換する */
export function buildTraceLogs(analysis: Analysis): StudentStep4TraceLog[] {
  return analysis.questions.map((q) => {
    const selected = q.studentInitialSelectedOption;
    const correct = q.redBluePenGrading.correctedOptionNumber ?? q.officialCorrectOption;
    const isCorrect = selected !== null && selected === correct;
    const wrongTraps = q.choices.flatMap((c) => (c.isCorrectAnswer ? [] : c.actualTrapTypes.slice(0, 1).map((t) => DOMAIN_TO_PROTOCOL_TRAP[t])));
    const selectedChoice = q.choices.find((c) => c.optionNumber === selected);
    const selectedTrapRaw = selectedChoice && !selectedChoice.isCorrectAnswer ? selectedChoice.actualTrapTypes[0] : undefined;
    const selectedTrap = selectedTrapRaw ? DOMAIN_TO_PROTOCOL_TRAP[selectedTrapRaw] : undefined;
    return {
      questionLabel: q.questionNumberLabel,
      selectedOptionByStudent: selected === null ? '' : String(selected),
      correctOptionFromRedPen: String(correct),
      isCorrect,
      allChoicesTraps: wrongTraps,
      selectedChoiceTrap: isCorrect ? undefined : selectedTrap,
      blackPencilTraces: {
        hasSlashSegmentation: q.blackPencilTraces.some((t) => t.isEliminatedBySlash),
        crossedOutOptions: q.blackPencilTraces.filter((t) => t.isEliminatedBySlash).map((t) => String(t.optionNumber)),
        underlinedMarkersInPassage: q.blackPencilTraces.flatMap((t) => t.underlinedOrCrossedPhrases),
        detectedWeakStep: inferWeakStep(isCorrect, selectedTrap),
      },
      redPenCorrections: {
        markingSymbol: MARK_FROM_API[q.redBluePenGrading.gradingMark],
        writtenMemo: q.redBluePenGrading.redPenNotes.join(' / '),
        inferredTrapType: isCorrect ? undefined : selectedTrap,
      },
    };
  });
}

