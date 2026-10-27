import assert from 'node:assert/strict';
import {
  AI_TRAP_TO_DOMAIN,
  estimateBase64Bytes,
  isPlayable,
  parseImportedMaterialJson,
  stripDataUrlPrefix,
  validateGeneratedMaterial,
  validateImportedMaterial,
} from '../src/lib/import-material';
import { customMaterialRepository, isUuid } from '../src/lib/repositories/customMaterialRepository';
import { getTodayKey } from '../src/components/common/cinematic-splash';
import { importMaterialResponseSchema } from '../src/lib/gemini/import-material';
import { TRAP_METADATA_MAP } from '../src/types/domain';
import { ImportedMaterialSchema, TargetLevelEnum, TrapTypeEnum, type ExamAnalysisResult, type ImportedMaterial } from '../src/types/ai-pipeline';

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
assert.equal(synced.updatedWeaknesses.causal_inversion, 25, '1回の加算は上限25');
for (let i = 0; i < 4; i++) customMaterialRepository.syncExamAnalysisToCarte(analysis);
assert.equal(customMaterialRepository.getTrapWeaknesses().causal_inversion, 100, '100 で頭打ち');
assert.equal(customMaterialRepository.getInstructorCarteRecords().length, 5);
assert.equal(customMaterialRepository.rewardTrapOvercome('causal_inversion').causal_inversion, 92);
assert.equal(customMaterialRepository.rewardTrapOvercome('none').causal_inversion, 92);
assert.equal(customMaterialRepository.rewardTrapOvercome('substitution').substitution, 0, '0 未満にならない');

// --- Phase 7: テキスト生成教材の追加検証・UUID採番・メタ情報
const generated = structuredClone(material);
const gq = generated.questions[0];
assert.ok(gq);
assert.ok(validateGeneratedMaterial(generated).some((w) => w.includes('4択')), '選択肢が4つ未満なら警告');
const four = ['ア', 'イ', 'ウ', 'エ'].map((id, i) => ({
  id,
  text: id,
  isCorrect: i === 0,
  trapType: (['none', 'overstatement', 'overstatement', 'unmentioned'] as ImportedMaterial['questions'][number]['choices'][number]['trapType'][])[i]!,
  trapExplanation: 'e',
  slashSegments: [{ segmentText: id, status: i === 0 ? ('valid' as const) : ('trap' as const) }],
}));
gq.choices = four;
assert.ok(validateGeneratedMaterial(generated).some((w) => w.includes('重複')), '誤答トラップの重複を検出');
four[2]!.trapType = 'causal_inversion';
assert.deepEqual(validateGeneratedMaterial(generated), []);
four[3]!.slashSegments = [{ segmentText: 'x', status: 'valid' }];
assert.ok(validateGeneratedMaterial(generated).some((w) => w.includes('傷')), '誤答に傷の節が無ければ警告');

const withMeta = customMaterialRepository.saveImportedMaterial(material, { sourceType: 'TEXT_PASTE', targetLevel: 'SOKEI' });
assert.ok(withMeta && isUuid(withMeta.id), '教材IDは UUID');
assert.equal(customMaterialRepository.getImportedMaterialById(withMeta.id)?.targetLevel, 'SOKEI');
assert.equal(customMaterialRepository.updateImportedMaterial(withMeta.id, material)?.sourceType, 'TEXT_PASTE', '編集してもメタ情報を保持');
const cloudOnly = { ...withMeta, id: '11111111-2222-4333-8444-555555555555', title: 'クラウド由来' };
const merged = customMaterialRepository.mergeImportedMaterials([cloudOnly]);
assert.ok(merged.some((m) => m.title === 'クラウド由来') && merged.some((m) => m.id === withMeta.id));
assert.equal(isUuid('custom-123'), false);
assert.deepEqual(TargetLevelEnum.options, ['COMMON_TEST', 'MARCH', 'SOKEI', 'NATIONAL_HARD']);

console.log('test-import: all assertions passed');
