import assert from 'node:assert/strict';
import { detectImageType, examAnalysisSchema, simulateExamAnalysis, toAnalysisSummary } from '../src/lib/exam-analysis';
import { buildExamPrompt, parseExamAnalysisJson } from '../src/lib/gemini/analyze-exam-sheet';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]);
assert.equal(detectImageType(png), 'image/png');
assert.equal(detectImageType(jpg), 'image/jpeg');
assert.equal(detectImageType(new TextEncoder().encode('<svg onload=alert(1)>')), null);
assert.equal(detectImageType(new TextEncoder().encode('GIF89a')), null);
assert.equal(detectImageType(new Uint8Array([])), null);

const sim = simulateExamAnalysis(['CONCEPT_SWAP']);
assert.ok(examAnalysisSchema.safeParse(sim).success);
assert.equal(sim.source, 'simulation');
assert.ok(sim.notice?.includes('解析していません'));
assert.deepEqual(sim.focusTraps.map((f) => f.trap), ['CONCEPT_SWAP']);
assert.equal(simulateExamAnalysis([]).focusTraps.length, 2);
assert.equal(toAnalysisSummary(sim).weaknesses[0], 'CONCEPT_SWAP');

const ok = parseExamAnalysisJson('```json\n' + JSON.stringify({
  summary: 's', choiceTendencies: [{ trap: 'OVERSTATEMENT', observation: 'o' }],
  descriptiveIssues: [{ item: 'i', cause: 'c' }], focusTraps: [{ trap: 'CAUSAL_REVERSAL', reason: 'r' }], nextActions: ['a'],
}) + '\n```');
assert.ok(ok);
// 未知のトラップID・巨大配列・不正JSONは拒否
assert.equal(parseExamAnalysisJson(JSON.stringify({ ...ok, focusTraps: [{ trap: 'HACK', reason: 'r' }] })), null);
assert.equal(parseExamAnalysisJson(JSON.stringify({ ...ok, nextActions: Array(7).fill('a') })), null);
assert.equal(parseExamAnalysisJson('oops'), null);
assert.ok(buildExamPrompt(['PARTIAL_CONTRADICTION']).includes('局所矛盾'));
console.log('exam-analysis tests OK');
