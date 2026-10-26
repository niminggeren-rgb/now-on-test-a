import assert from 'node:assert/strict';
import {
  AI_TRAP_TO_DOMAIN,
  estimateBase64Bytes,
  isPlayable,
  parseImportedMaterialJson,
  stripDataUrlPrefix,
  validateImportedMaterial,
} from '../src/lib/import-material';
import { customMaterialRepository } from '../src/lib/repositories/customMaterialRepository';
import { getTodayKey } from '../src/components/common/cinematic-splash';
import { importMaterialResponseSchema } from '../src/lib/gemini/import-material';
import { TRAP_METADATA_MAP } from '../src/types/domain';
import { ImportedMaterialSchema, TrapTypeEnum, type ExamAnalysisResult, type ImportedMaterial } from '../src/types/ai-pipeline';

function choice(id: string, correct: boolean, trap: ImportedMaterial['questions'][number]['choices'][number]['trapType']) {
  return {
    id,
    text: `選択肢${id}`,
    isCorrect: correct,
    trapType: trap,
    trapExplanation: '解説',
    slashSegments: [{ segmentText: `選択肢${id}`, status: correct ? ('valid' as const) : ('trap' as const) }],
  };
}

const material: ImportedMaterial = {
  title: 'テスト教材',
  author: '出典不明（現代文評論）',
  difficulty: 'hard',
  paragraphs: [{ paragraphNumber: 1, content: '近代は主体を重んじた。しかし身体は忘れられた。' }],
  underlines: [{ id: 'underline-1', label: '傍線部①', exactText: '身体は忘れられた', paragraphNumber: 1 }],
  questions: [
    {
      questionNumber: '問一',
      targetUnderlineId: 'underline-1',
      questionText: '傍線部①とはどういうことか。',
      logicalHint: '対比',
      evidenceQuote: '身体は忘れられた',
      choices: [choice('ア', true, 'none'), choice('イ', false, 'overstatement')],
    },
  ],
};

// --- スキーマ・パース
assert.ok(ImportedMaterialSchema.safeParse(material).success);
assert.equal(TrapTypeEnum.options.length, 6);
const fenced = '```json\n' + JSON.stringify(material) + '\n```';
assert.deepEqual(parseImportedMaterialJson(fenced), material);
assert.equal(parseImportedMaterialJson('oops'), null);
assert.equal(parseImportedMaterialJson(JSON.stringify({ ...material, questions: [{ questionNumber: '問一' }] })), null);
assert.equal(parseImportedMaterialJson(undefined), null);

// --- 整合性チェック
assert.deepEqual(validateImportedMaterial(material), []);
assert.ok(isPlayable(material));
const bad = structuredClone(material);
const badUnderline = bad.underlines[0];
const badChoice = bad.questions[0]?.choices[1];
assert.ok(badUnderline && badChoice);
badUnderline.exactText = '存在しない文字列';
badChoice.isCorrect = true; // 正解2つ + 分類不一致
const warnings = validateImportedMaterial(bad);
assert.ok(warnings.some((w) => w.includes('傍線部①')));
assert.ok(warnings.some((w) => w.includes('正解の選択肢が2個')));
assert.ok(warnings.some((w) => w.includes('一致していません')));
assert.equal(isPlayable(bad), false);
assert.equal(isPlayable({ ...material, questions: [] }), false);

// --- ヘルパー
assert.equal(stripDataUrlPrefix('data:image/jpeg;base64,AAAA'), 'AAAA');
assert.equal(stripDataUrlPrefix('AAAA'), 'AAAA');
assert.equal(estimateBase64Bytes(Buffer.from('hello world').toString('base64')), 11);
for (const domain of Object.values(AI_TRAP_TO_DOMAIN)) assert.ok(domain in TRAP_METADATA_MAP);
assert.equal(importMaterialResponseSchema.required?.length, 6);
assert.equal(getTodayKey(new Date(2026, 0, 5)), '2026-01-05');

// --- リポジトリ（localStorage のフェイクで検証）
const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
};
Object.assign(globalThis, { window: { localStorage: fakeStorage } });

assert.deepEqual(customMaterialRepository.getAllImportedMaterials(), []);
const w0 = customMaterialRepository.getTrapWeaknesses();
assert.equal(w0.overstatement + w0.causal_inversion + w0.substitution + w0.unmentioned + w0.subject_object_reversal, 0, '初期値はダミーを入れず 0');

const saved = customMaterialRepository.saveImportedMaterial(material);
assert.ok(saved);
assert.equal(customMaterialRepository.getImportedMaterialById(saved.id)?.title, 'テスト教材');
const edited = customMaterialRepository.updateImportedMaterial(saved.id, { ...material, title: '編集後' });
assert.equal(edited?.title, '編集後');
assert.equal(edited?.createdAt, saved.createdAt);
assert.equal(customMaterialRepository.getAllImportedMaterials().length, 1);
assert.equal(customMaterialRepository.updateImportedMaterial('nope', material), null);
// 壊れたレコードは捨て、正常なものは残す
store.set('lv_custom_imported_passages', JSON.stringify([{ id: 'x' }, { ...edited }]));
assert.equal(customMaterialRepository.getAllImportedMaterials().length, 1);
store.set('lv_custom_imported_passages', '{broken');
assert.deepEqual(customMaterialRepository.getAllImportedMaterials(), []);
customMaterialRepository.saveImportedMaterial(material);
const first = customMaterialRepository.getAllImportedMaterials()[0];
assert.ok(first);
customMaterialRepository.deleteImportedMaterial(first.id);
assert.equal(customMaterialRepository.getAllImportedMaterials().length, 0);

const analysis: ExamAnalysisResult = {
  examTitle: '模試',
  estimatedScoreRate: 62,
  overallSummary: '総評',
  questionDiagnostics: [],
  trapWeaknessDelta: { overstatement: 20, causal_inversion: 90, substitution: 0, unmentioned: 0, subject_object_reversal: 5 },
  instructorAdvice: { headline: '見出し', actionPlan: ['a', 'b', 'c'] },
  remedialQuestion: {
    targetTrap: 'causal_inversion',
    miniPassage: '本文',
    questionText: '設問',
    choices: ['1', '2', '3', '4'].map((id, i) => ({ id, text: id, isCorrect: i === 0, explanation: 'e' })),
  },
};
const synced = customMaterialRepository.syncExamAnalysisToCarte(analysis);
assert.equal(synced.updatedWeaknesses.causal_inversion, 90);
customMaterialRepository.syncExamAnalysisToCarte(analysis);
assert.equal(customMaterialRepository.getTrapWeaknesses().causal_inversion, 100, '100 で頭打ち');
assert.equal(customMaterialRepository.getInstructorCarteRecords().length, 2);
assert.equal(customMaterialRepository.rewardTrapOvercome('causal_inversion').causal_inversion, 92);
assert.equal(customMaterialRepository.rewardTrapOvercome('none').causal_inversion, 92);
assert.equal(customMaterialRepository.rewardTrapOvercome('substitution').substitution, 0, '0 未満にならない');

console.log('test-import: all assertions passed');
