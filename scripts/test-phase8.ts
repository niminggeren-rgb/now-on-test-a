import assert from 'node:assert/strict';
import { OnDemandRequestSchema, Stage1TriageResponseSchema, Stage2InkSeparatedResponseSchema } from '../src/lib/ai/schemas/phase8Schemas';
import { describeApiFailure } from '../src/lib/api-error';
import { EXAM_UPLOAD_COMPRESSION, savedPercent } from '../src/lib/client-image';
import { resolveGeminiKey } from '../src/lib/gemini/client';
import { detectImageType } from '../src/lib/exam-analysis';
import { evaluateReasoningMatch, type MatchQuestion } from '../src/lib/logic/reasoningMatcher';

// --- WebP の先頭バイト判定
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
assert.equal(detectImageType(webp), 'image/webp');
assert.equal(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])), null, 'WAV は不可');
assert.equal(savedPercent({ originalBytes: 1000, compressedBytes: 150 }), 85);
assert.equal(savedPercent({ originalBytes: 100, compressedBytes: 300 }), 0, '拡大時は 0');
assert.equal(savedPercent({ originalBytes: 0, compressedBytes: 10 }), 0);

// --- Reasoning Match
const q: MatchQuestion = {
  questionNumberLabel: '問1',
  officialCorrectOption: 3,
  choices: [
    { optionNumber: 1, isCorrectAnswer: false, actualTrapTypes: ['OVERSTATEMENT'], flawSpan: 'すべての人が' },
    { optionNumber: 2, isCorrectAnswer: false, actualTrapTypes: ['CAUSAL_REVERSAL'], flawSpan: '結果として原因が' },
    { optionNumber: 3, isCorrectAnswer: true, actualTrapTypes: [], flawSpan: null },
    { optionNumber: 4, isCorrectAnswer: false, actualTrapTypes: ['UNMENTIONED'], flawSpan: '歴史的に' },
  ],
};

const master = evaluateReasoningMatch(q, 3, [
  { optionNumber: 1, selectedTrapType: 'OVERSTATEMENT' },
  { optionNumber: 2, selectedTrapType: 'CAUSAL_REVERSAL' },
  { optionNumber: 4, selectedTrapType: 'UNMENTIONED' },
]);
assert.equal(master.isLogicalHitMaster, true);
assert.equal(master.luckyHitDetected, false);
assert.equal(master.logicalHitScore, 100 * (3 * 20 + 20) / 80);
assert.deepEqual(master.verdicts.map((v) => v.status), ['LOGICAL_HIT', 'LOGICAL_HIT', 'CORRECT_SELECTION', 'LOGICAL_HIT']);

const lucky = evaluateReasoningMatch(q, 3, [
  { optionNumber: 1, selectedTrapType: 'UNMENTIONED' }, // 理由ズレ
  { optionNumber: 2, selectedTrapType: null },
  { optionNumber: 4, selectedTrapType: 'OVERSTATEMENT' },
]);
assert.equal(lucky.isAnswerCorrect, true);
assert.equal(lucky.luckyHitDetected, true);
assert.equal(lucky.isLogicalHitMaster, false);
assert.ok(lucky.verdicts.slice(0, 2).every((v) => v.status === 'LUCKY_ELIMINATION'));

const partial = evaluateReasoningMatch(q, 3, [{ optionNumber: 1, selectedTrapType: 'UNMENTIONED', markedFlawText: 'すべての人' }]);
assert.equal(partial.verdicts[0]?.status, 'PARTIAL_HIT');
assert.equal(partial.verdicts[1]?.status, 'FATAL_KEEP', '消さなかった誤答は見落とし');

const wrong = evaluateReasoningMatch(q, 1, [{ optionNumber: 3, selectedTrapType: 'CONCEPT_SWAP' }]);
assert.equal(wrong.isAnswerCorrect, false);
assert.equal(wrong.verdicts[2]?.status, 'WRONG_ELIMINATION');

// UI 入力が無いときは鉛筆OCRの痕跡で補完（赤ペンの正解は officialCorrectOption 側）
const fromPencil = evaluateReasoningMatch(
  { ...q, studentInitialSelectedOption: 1, blackPencilTraces: [{ optionNumber: 1, isEliminatedBySlash: false, underlinedOrCrossedPhrases: [], inferredStudentTrapReason: null }, { optionNumber: 2, isEliminatedBySlash: true, underlinedOrCrossedPhrases: ['結果として'], inferredStudentTrapReason: 'CAUSAL_REVERSAL' }] },
  null,
  [],
);
assert.equal(fromPencil.isAnswerCorrect, false, '自力解答は1、正解は3');
assert.equal(fromPencil.verdicts[1]?.status, 'LOGICAL_HIT');

// --- スキーマ
assert.ok(Stage1TriageResponseSchema.safeParse({ items: [{ imageIndex: 0, imageId: 'a', category: 'PASSAGE', hasHandwriting: false, hasDiagramOrIllustration: false, requiresVisualInspection: false, extractedRawText: 'x' }] }).success);
assert.ok(!Stage1TriageResponseSchema.safeParse({ items: [{ imageIndex: 0, imageId: 'a', category: 'OTHER' }] }).success);
assert.ok(!Stage2InkSeparatedResponseSchema.safeParse({ passageTitle: null, passageAuthor: null, consolidatedPassageText: '', questions: [{ questionNumberLabel: '問1', questionPrompt: '', underlinedTargetText: null, studentInitialSelectedOption: null, officialCorrectOption: 1, blackPencilTraces: [{ optionNumber: 1, isEliminatedBySlash: true, underlinedOrCrossedPhrases: [], inferredStudentTrapReason: 'LOCAL_CONTRADICTION' }], redBluePenGrading: { gradingMark: 'NONE', correctedOptionNumber: null, redPenNotes: [] }, choices: [] }] }).success, '未知のトラップ名・選択肢0は拒否');
assert.ok(!OnDemandRequestSchema.safeParse({ mode: 'THINKING_PROCESS', passageText: '   ' }).success);
assert.equal(OnDemandRequestSchema.parse({ mode: 'THINKING_PROCESS', passageText: '本文' }).questionPrompt, '');

// --- Gemini キーの解決（Vercel の設定画面での貼り付けミスに強い）
assert.equal(resolveGeminiKey({}), null);
assert.equal(resolveGeminiKey({ GEMINI_API_KEY: 'your-google-genai-api-key' }), null, 'サンプル値は未設定扱い');
assert.equal(resolveGeminiKey({ GEMINI_API_KEY: '   ' }), null);
assert.deepEqual(resolveGeminiKey({ GEMINI_API_KEY: ' AIzaKey123\n' }), { apiKey: 'AIzaKey123', source: 'GEMINI_API_KEY' }, '前後の空白・改行を除く');
assert.equal(resolveGeminiKey({ GEMINI_API_KEY: '"AIzaKey123"' })?.apiKey, 'AIzaKey123', '引用符を除く');
assert.deepEqual(resolveGeminiKey({ GEMINI_API_KEY: 'your-x', GOOGLE_API_KEY: 'AIzaB' }), { apiKey: 'AIzaB', source: 'GOOGLE_API_KEY' }, '別名にフォールバック');

// --- 失敗理由の表示（一律「ピントと明るさ」にしない）
assert.deepEqual(EXAM_UPLOAD_COMPRESSION, { maxEdge: 1200, quality: 0.7 });
assert.equal(describeApiFailure(504, null), '処理がタイムアウトしました。もう一度お試しください。', 'JSON でない 504 はタイムアウト');
assert.equal(describeApiFailure(502, null), '処理がタイムアウトしました。もう一度お試しください。');
assert.equal(describeApiFailure(413, null), '画像のサイズが大きすぎます。枚数を減らすか、別の写真でお試しください。');
assert.equal(describeApiFailure(504, { success: false, error: '独自の理由' }), '独自の理由', 'サーバーの理由があればそれを優先');
assert.ok(!describeApiFailure(500, null).includes('ピント'));

console.log('test-phase8: all assertions passed');
