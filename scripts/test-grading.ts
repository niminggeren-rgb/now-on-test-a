import assert from 'node:assert/strict';
import { countAnswerChars, gradeDescriptiveLocally, normalizeGeminiEvaluation } from '../src/lib/descriptive-grading';
import { buildGradingPrompt, parseGeminiJson } from '../src/lib/gemini/evaluate-descriptive';
import { MOCK_PASSAGES } from '../src/lib/mock-data/passages';
import { segmentParagraph } from '../src/lib/passage-text';

const passage = MOCK_PASSAGES[0]!;
const q = passage.questions.find((x) => x.questionType === 'DESCRIPTIVE_400')!;
const model = q.modelAnswerText!;

// 模範解答は満点
const best = gradeDescriptiveLocally(q, model);
assert.equal(best.totalScore, 100);
assert.equal(best.charCount, 385);
assert.equal(best.source, 'local');
assert.equal(best.deductions.length, 0);

// 空・無関係な答案は 0 点付近
const off = gradeDescriptiveLocally(q, 'とても面白い文章だと思いました。筆者の意見に賛成です。'.repeat(3));
assert.ok(off.totalScore <= 10, `off-topic score ${off.totalScore}`);
assert.ok(off.deductions.some((d) => d.severity === 'major'));

// 一部要素のみ: 中間点、字数不足の減点も付く
const partial = gradeDescriptiveLocally(q, '近代の空間は透明で摩擦がなく効率を重視し、抵抗やノイズが排除されている。身体は記号的な端末だと錯覚される。');
assert.ok(partial.totalScore > 10 && partial.totalScore < 60, `partial ${partial.totalScore}`);
assert.ok(partial.deductions.some((d) => d.issue.includes('字数')));

// 字数超過 → -10
const over = gradeDescriptiveLocally(q, model + 'あ'.repeat(30));
assert.equal(over.totalScore, 90);

// 言い過ぎ表現の指摘
const claim = gradeDescriptiveLocally(q, model.replace('実質的な', '') + '必ず');
assert.ok(claim.deductions.some((d) => d.issue.includes('断定')));

// 空白・改行は字数に含めない
assert.equal(countAnswerChars(' あ い\nう　え '), 4);

// Gemini JSON: コードフェンス付きでも解釈 / 不正は null
const raw = parseGeminiJson('```json\n' + JSON.stringify({
  rubricScores: [
    { rubricId: 'rubric-1', earnedPoints: 25, comment: 'ok' },
    { rubricId: 'rubric-2', earnedPoints: 999, comment: 'too many' }, // クランプされる
    { rubricId: 'rubric-3', earnedPoints: -5, comment: 'neg' },
    { rubricId: 'unknown', earnedPoints: 25, comment: 'ignored' },
  ],
  deductions: [{ quote: '近代の空間', issue: '飛躍', severity: 'minor' }],
  logicalLeaps: ['因果が逆'], rewriteSuggestion: 'r', overallComment: 'c',
}) + '\n```');
assert.ok(raw);
const norm = normalizeGeminiEvaluation(q, model, raw!);
assert.deepEqual(norm.rubricScores.map((r) => r.earnedPoints), [25, 25, 0, 0]);
assert.equal(norm.totalScore, 50);
assert.equal(norm.source, 'gemini');
assert.equal(parseGeminiJson('not json'), null);
assert.equal(parseGeminiJson('{"rubricScores": "x"}'), null);
assert.equal(parseGeminiJson(undefined), null);

// プロンプトは答案を区切りタグで囲み、ルーブリックIDを含む
const prompt = buildGradingPrompt(passage, q, '答案本文');
assert.ok(prompt.includes('<student_answer>\n答案本文\n</student_answer>'));
assert.ok(prompt.includes('rubric-4'));

// 本文セグメント: 傍線部とマーカー
const p2 = passage.paragraphs[1]!;
const segs = segmentParagraph(p2.text, p2.underlines, true);
assert.ok(segs.some((s) => s.kind === 'underline' && s.underline.id === 'u1'));
assert.ok(segs.some((s) => s.kind === 'marker' && s.marker === 'CONTRAST' && s.text === 'しかし'));
assert.ok(segs.some((s) => s.kind === 'marker' && s.marker === 'SUMMARY' && s.text === 'こうして'));
assert.equal(segs.map((s) => s.text).join(''), p2.text);
const plain = segmentParagraph(p2.text, p2.underlines, false);
assert.equal(plain.filter((s) => s.kind === 'marker').length, 0);
assert.equal(plain.map((s) => s.text).join(''), p2.text);
const p4 = MOCK_PASSAGES[1]!.paragraphs[2]!;
assert.ok(segmentParagraph(p4.text, p4.underlines, true).some((s) => s.kind === 'marker' && s.text === 'これに対して'));

console.log('grading tests OK');
