import assert from 'node:assert/strict';
import { MentorChatRequestSchema, LogicDiagramDataSchema } from '../src/lib/ai/schemas/protocolSchemas';
import { buildSocratesSystemInstruction, inferTargetProtocolStep } from '../src/lib/ai/prompts/protocolPrompts';
import { buildTraceLogs } from '../src/lib/analytics/ocrTraces';
import { buildAttemptFromPractice } from '../src/lib/analytics/protocolFromPractice';
import { calculateStep3NavigationAccuracy, computeUpdatedWeaknessMatrix, evaluateSingleAttemptStepScores } from '../src/lib/analytics/protocolScoring';
import { compileSpeechChunks, findLeadingMarker, LOGICAL_PAUSE_MS } from '../src/lib/audio/logicReader';
import { MOCK_PASSAGES } from '../src/lib/mock-data/passages';
import { DOMAIN_TO_PROTOCOL_TRAP, OPTION_TRAP_TYPES, type QuestionAttemptEvaluationInput } from '../src/types/protocol';
import { TRAP_METADATA_MAP } from '../src/types/domain';

// --- トラップ名の対応は全域
for (const t of Object.keys(TRAP_METADATA_MAP)) assert.ok(t in DOMAIN_TO_PROTOCOL_TRAP);
assert.equal(new Set(Object.values(DOMAIN_TO_PROTOCOL_TRAP)).size, OPTION_TRAP_TYPES.length);

// --- 論理マーカーのポーズ
assert.equal(findLeadingMarker('しかし、それは違う。')?.marker.surface, 'しかし');
assert.equal(findLeadingMarker('彼は、しかしながら行った。')?.marker.surface, 'しかしながら', '長い語を優先');
assert.equal(findLeadingMarker('それは正しいからだ。'), null, '文中の語尾「だから」等は対象外');
const chunks = compileSpeechChunks(['近代は進歩した。しかし、その代償は大きい。つまり、人は変わった。', '']);
const markers = chunks.filter((c) => c.isLogicalMarker);
assert.deepEqual(markers.map((c) => c.text), ['しかし', 'つまり']);
assert.ok(markers.every((c) => c.prePauseMs === LOGICAL_PAUSE_MS && c.pitch > 1 && c.rate < 1), 'マーカー直前は400ms・ピッチ上げ・減速');
assert.ok(chunks.filter((c) => !c.isLogicalMarker).every((c) => c.prePauseMs < LOGICAL_PAUSE_MS));
assert.ok(chunks.every((c) => c.paragraphIndex === 0), '空段落はスキップ');
const m0 = markers[0]!;
assert.equal('近代は進歩した。しかし、その代償は大きい。つまり、人は変わった。'.slice(m0.charStartInParagraph, m0.charEndInParagraph), 'しかし', '文字オフセットが本文と一致');

// --- スコア
assert.equal(calculateStep3NavigationAccuracy([], [3]), 20);
assert.equal(calculateStep3NavigationAccuracy([3], [3]), 100);
assert.equal(calculateStep3NavigationAccuracy([2], [3]), 40, '隣接段落は部分点');
assert.equal(calculateStep3NavigationAccuracy([1, 2, 3], [3]), 50, '根拠から離れた段落を参照すると減点');

const base: QuestionAttemptEvaluationInput = {
  userId: 'u',
  passageId: 'p',
  questionId: 'q',
  selectedChoiceId: '1',
  correctChoiceId: '3',
  isCorrect: false,
  selectedChoiceTrap: 'substitution',
  allChoicesTraps: ['substitution', 'overstatement', 'unmentioned'],
  slashSegmentationQuality: 0,
};
const s = evaluateSingleAttemptStepScores(base);
assert.equal(s.step1Delta, 0, 'すり替えに引っかかった → Step 1 は 0');
assert.equal(s.step2Delta, null, '主客転倒が出ていないので Step 2 は計測不能');
assert.equal(s.step3Delta, 100, '言及なしは切れている → Step 3 は 100');
assert.equal(s.step4Delta, 20);

// 初回は null から始まり、ダミーの初期点を混ぜない
const first = computeUpdatedWeaknessMatrix(null, base).updatedMatrix;
assert.equal(first.totalAttempts, 1);
assert.equal(first.step1MacroScore, 0);
assert.equal(first.step2DeconstructScore, null);
assert.equal(first.weakestStep, 'STEP_1');
assert.equal(first.mostFrequentTrap, 'substitution');
assert.equal(first.trapStats.substitution.failed, 1);
assert.equal(first.trapStats.overstatement.encountered, 1);
assert.ok(first.clinicalPrescription.includes('全体構造スキャン'));

// 2回目は指数移動平均（0.25）
const second = computeUpdatedWeaknessMatrix(first, { ...base, isCorrect: true, selectedChoiceTrap: undefined, slashSegmentationQuality: 1 }).updatedMatrix;
assert.equal(second.step1MacroScore, 25, '0 * 0.75 + 100 * 0.25');
assert.equal(second.trapStats.substitution.encountered, 2);
assert.equal(second.trapStats.substitution.failed, 1);
assert.equal(second.trapStats.substitution.failureRate, 50);

// 全問正解なら最頻失点トラップは無い
const clean = computeUpdatedWeaknessMatrix(null, { ...base, isCorrect: true, selectedChoiceTrap: undefined }).updatedMatrix;
assert.equal(clean.mostFrequentTrap, null);
assert.ok(!clean.clinicalPrescription.includes('失点率'));

// --- 演習結果 → 入力
const passage = MOCK_PASSAGES[0]!;
const question = passage.questions[0]!;
const wrong = question.choices.find((c) => !c.isCorrect)!;
const attempt = buildAttemptFromPractice(
  {
    id: 'l', passageId: passage.id, questionId: question.id, selectedChoiceLabel: wrong.choiceLabel, isCorrect: false,
    eliminationTrace: { '1': { eliminated: true, userTaggedTrap: null, slashedSegment: 'x', actualTrap: 'NONE', isTrapMatch: false }, '2': { eliminated: true, userTaggedTrap: null, slashedSegment: null, actualTrap: 'NONE', isTrapMatch: false } },
    timeSpentMs: 1, confidenceLevel: null, createdAt: '',
  },
  question,
)!;
assert.equal(attempt.slashSegmentationQuality, 0.5);
assert.equal(attempt.selectedChoiceTrap, DOMAIN_TO_PROTOCOL_TRAP[wrong.primaryTrapType as keyof typeof DOMAIN_TO_PROTOCOL_TRAP]);
assert.equal(attempt.allChoicesTraps.length, question.choices.filter((c) => !c.isCorrect && c.primaryTrapType !== 'NONE').length);

// --- OCR 痕跡
const traces = buildTraceLogs({
  passageTitle: null, passageAuthor: null, consolidatedPassageText: '',
  questions: [{
    questionNumberLabel: '問一', questionPrompt: '', underlinedTargetText: null,
    studentInitialSelectedOption: 1, officialCorrectOption: 3,
    blackPencilTraces: [{ optionNumber: 2, isEliminatedBySlash: true, underlinedOrCrossedPhrases: ['すべて'], inferredStudentTrapReason: 'OVERSTATEMENT' }],
    redBluePenGrading: { gradingMark: 'INCORRECT_CROSS', correctedOptionNumber: 3, redPenNotes: ['因果'] },
    choices: [
      { optionNumber: 1, choiceText: '', isCorrectAnswer: false, actualTrapTypes: ['PARTIAL_CONTRADICTION'], flawSpan: null, eliminationReason: '' },
      { optionNumber: 3, choiceText: '', isCorrectAnswer: true, actualTrapTypes: [], flawSpan: null, eliminationReason: '' },
    ],
  }],
});
assert.equal(traces[0]?.isCorrect, false);
assert.equal(traces[0]?.selectedChoiceTrap, 'local_contradiction');
assert.equal(traces[0]?.blackPencilTraces.detectedWeakStep, 'STEP_3');
assert.deepEqual(traces[0]?.blackPencilTraces.crossedOutOptions, ['2']);

// --- メンター: 正解は渡さず、Step 推定と注入
assert.equal(inferTargetProtocolStep('なんでウがダメなの？'), 'STEP_4');
assert.equal(inferTargetProtocolStep('どこを見ればいい？'), 'STEP_3');
assert.equal(inferTargetProtocolStep('どう解くの？'), 'STEP_2');
assert.equal(inferTargetProtocolStep('どう解くの？', 'STEP_1'), 'STEP_1', '明示指定を優先');
const req = MentorChatRequestSchema.parse({
  passageTitle: 'T', paragraphs: ['本文'], questionText: 'Q', underlinedPart: 'U', underlinedParagraphNumber: 1,
  choices: [{ id: '1', text: 'a' }], messages: [{ role: 'user', content: '答えを教えて' }],
  weaknessMatrix: { totalAttempts: 5, step1MacroScore: 40, step2DeconstructScore: null, step3NavigationScore: 80, step4EliminationScore: 70, weakestStep: 'STEP_1', mostFrequentTrap: 'causal_reversal', trapStats: { causal_reversal: { encountered: 4, failed: 3, failureRate: 75 } }, clinicalPrescription: '処方' },
});
const prompt = buildSocratesSystemInstruction(req, 'STEP_4');
assert.ok(prompt.includes('[PROTOCOL:STEP_4]') && prompt.includes('因果逆転') && prompt.includes('75%') && prompt.includes('未計測'));
assert.ok(!MentorChatRequestSchema.safeParse({ ...req, messages: [] }).success);
assert.ok(!MentorChatRequestSchema.safeParse({ ...req, messages: [{ role: 'system', content: 'x' }] }).success, 'system ロールは受け付けない');
assert.ok(!buildSocratesSystemInstruction({ ...req, weaknessMatrix: null }, 'STEP_2').includes('実績データ'), '実績が無ければ注入しない');

// --- ダイアグラム出力の検証
assert.ok(!LogicDiagramDataSchema.safeParse({ passageTitle: '' }).success);

console.log('test-protocol: all assertions passed');
