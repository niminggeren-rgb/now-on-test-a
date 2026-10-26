import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_ANSWER_LOGS, INITIAL_MOCK_EXAMS, INITIAL_TRAP_STATS } from './fixtures/sample-analytics';
import { createRepository, STORAGE_KEYS, type StorageLike } from '../src/lib/repository';
import { computeWeaknessScore, emptyTrapStats } from '../src/lib/scoring';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const PASSAGE = 'passage-aesthetics-001';
const Q = `${PASSAGE}-q1`; // 正解=3, 1:OVER 2:CAUSAL 4:SWAP

function seed(storage: StorageLike) {
  storage.setItem(STORAGE_KEYS.trapStats, JSON.stringify(INITIAL_TRAP_STATS));
  storage.setItem(STORAGE_KEYS.answerLogs, JSON.stringify(INITIAL_ANSWER_LOGS));
  storage.setItem(STORAGE_KEYS.mockExams, JSON.stringify(INITIAL_MOCK_EXAMS));
}

async function main() {
  // 0) 初回アクセス（保存データなし）: ダミーデータを返さず、完全に空の状態であること
  const fresh = createRepository(null, memoryStorage());
  assert.deepEqual(await fresh.getTrapStats(), emptyTrapStats());
  assert.ok((await fresh.getTrapStats()).every((s) => s.encounteredCount === 0 && s.weaknessScore === 0));
  assert.deepEqual(await fresh.listAnswerLogs(), []);
  assert.deepEqual(await fresh.listMockExams(), []);
  // 1問解くと、その1問ぶんだけが集計される（0件 → 実データ）
  const first = await fresh.submitAnswer({
    passageId: PASSAGE, questionId: Q, selectedChoiceLabel: 3, elimination: {}, timeSpentMs: 4200, confidenceLevel: null,
  });
  assert.ok(first.success && first.data.log.isCorrect);
  const logs0 = await fresh.listAnswerLogs();
  assert.equal(logs0.length, 1);
  assert.equal(logs0[0]?.timeSpentMs, 4200);
  const freshStats = await fresh.getTrapStats();
  assert.equal(freshStats.reduce((n, s) => n + s.encounteredCount, 0), 3); // 誤答3択ぶん
  assert.equal(freshStats.reduce((n, s) => n + s.trappedCount, 0), 0);
  // reset で未演習に戻る
  fresh.resetLocalData();
  assert.deepEqual(await fresh.listAnswerLogs(), []);

  // 1) Supabase 未接続: ローカルのみで動作（フィクスチャを保存済みの状態から開始）
  const storage = memoryStorage();
  seed(storage);
  const repo = createRepository(null, storage);
  assert.equal((await repo.listPassages()).length, 3);
  assert.equal((await repo.getPassage('nope')), null);
  const before = await repo.getTrapStats();
  assert.deepEqual(before, [...INITIAL_TRAP_STATS]);

  // 引っかかる回答: 選択肢2(因果逆転)を選び、1を言い過ぎと正しくタグ付け、4はタグ誤り
  const res = await repo.submitAnswer({
    passageId: PASSAGE,
    questionId: Q,
    selectedChoiceLabel: 2,
    elimination: {
      '1': { eliminated: true, userTaggedTrap: 'OVERSTATEMENT', slashedSegment: '完全に喪失し' },
      '4': { eliminated: true, userTaggedTrap: 'UNMENTIONED', slashedSegment: null },
    },
    timeSpentMs: 123456,
    confidenceLevel: 2,
  });
  assert.ok(res.success);
  if (!res.success) return;
  assert.equal(res.data.log.isCorrect, false);
  assert.equal(res.data.synced, false);
  assert.equal(res.data.log.eliminationTrace['1']?.isTrapMatch, true);
  assert.equal(res.data.log.eliminationTrace['4']?.isTrapMatch, false);
  assert.equal(res.data.log.eliminationTrace['4']?.actualTrap, 'CONCEPT_SWAP');

  const after = await repo.getTrapStats();
  const get = (stats: typeof after, t: string) => stats.find((s) => s.trapType === t)!;
  const c0 = get(before, 'CAUSAL_REVERSAL'), c1 = get(after, 'CAUSAL_REVERSAL');
  assert.equal(c1.encounteredCount, c0.encounteredCount + 1);
  assert.equal(c1.trappedCount, c0.trappedCount + 1);
  assert.equal(c1.correctlyTaggedCount, c0.correctlyTaggedCount); // 2 にタグ無し
  assert.equal(c1.weaknessScore, computeWeaknessScore(c1.encounteredCount, c1.trappedCount, c1.correctlyTaggedCount));
  assert.ok(c1.weaknessScore > c0.weaknessScore);
  const o0 = get(before, 'OVERSTATEMENT'), o1 = get(after, 'OVERSTATEMENT');
  assert.equal(o1.correctlyTaggedCount, o0.correctlyTaggedCount + 1);
  assert.equal(o1.trappedCount, o0.trappedCount);
  const s0 = get(before, 'CONCEPT_SWAP'), s1 = get(after, 'CONCEPT_SWAP');
  assert.equal(s1.encounteredCount, s0.encounteredCount + 1);
  assert.equal(s1.correctlyTaggedCount, s0.correctlyTaggedCount); // 誤タグ
  assert.ok(storage.data.has(STORAGE_KEYS.answerLogs) && storage.data.has(STORAGE_KEYS.trapStats));

  // 永続化: 新しいリポジトリインスタンスでも反映されている
  const repo2 = createRepository(null, storage);
  assert.deepEqual(await repo2.getTrapStats(), after);
  const logs = await repo2.listAnswerLogs(3);
  assert.equal(logs.length, 3);
  assert.equal(logs[0]?.id, res.data.log.id);

  // 正解を選んだ場合は trapped が増えない
  const ok = await repo2.submitAnswer({
    passageId: PASSAGE, questionId: Q, selectedChoiceLabel: 3, elimination: {}, timeSpentMs: 1000, confidenceLevel: null,
  });
  assert.ok(ok.success && ok.data.log.isCorrect);

  // 不正入力
  const bad = await repo.submitAnswer({ passageId: PASSAGE, questionId: Q, selectedChoiceLabel: 9, elimination: {}, timeSpentMs: -1 });
  assert.equal(bad.success, false);
  const missing = await repo.submitAnswer({ passageId: PASSAGE, questionId: 'zzz', selectedChoiceLabel: 1, elimination: {}, timeSpentMs: 0 });
  assert.deepEqual(missing, { success: false, error: '設問が見つかりません' });
  const noChoice = await repo.submitAnswer({ passageId: PASSAGE, questionId: Q, selectedChoiceLabel: 5, elimination: {}, timeSpentMs: 0 });
  assert.equal(noChoice.success, false);
  // 記述問題は拒否
  const desc = await repo.submitAnswer({ passageId: PASSAGE, questionId: `${PASSAGE}-q3`, selectedChoiceLabel: 1, elimination: {}, timeSpentMs: 0 });
  assert.equal(desc.success, false);

  // 破損データは空の状態にフォールバック（ダミーは返さない）
  storage.setItem(STORAGE_KEYS.trapStats, '{broken');
  assert.deepEqual(await createRepository(null, storage).getTrapStats(), emptyTrapStats());

  // 2) 模試
  assert.equal((await repo.listMockExams()).length, 4);
  const exam = await repo.addMockExam({
    examProvider: '駿台', examName: '駿台全国模試 第2回', examDate: '2026-11-08',
    modernJapaneseScore: 74, modernJapaneseMaxScore: 100, deviationValue: 65.1, selfReflection: '',
  });
  assert.ok(exam.success);
  const exams = await repo.listMockExams();
  assert.equal(exams.length, 5);
  assert.equal(exams.at(-1)?.examName, '駿台全国模試 第2回');
  const badExam = await repo.addMockExam({
    examProvider: '', examName: 'x', examDate: '2026/11/08', modernJapaneseScore: 120, modernJapaneseMaxScore: 100, deviationValue: 50,
  });
  assert.equal(badExam.success, false);
  if (!badExam.success) assert.ok(badExam.fieldErrors?.examProvider && badExam.fieldErrors.examDate && badExam.fieldErrors.modernJapaneseScore);

  // 3) Supabase がエラーを返しても落ちずにフォールバック
  const failing = {
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) },
    from: () => { throw new Error('connection refused'); },
  } as unknown as SupabaseClient;
  const repo3 = createRepository(failing, memoryStorage());
  assert.equal((await repo3.listPassages()).length, 3);
  assert.deepEqual(await repo3.getTrapStats(), emptyTrapStats());
  const r3 = await repo3.submitAnswer({ passageId: PASSAGE, questionId: Q, selectedChoiceLabel: 1, elimination: {}, timeSpentMs: 10 });
  assert.ok(r3.success && !r3.data.synced);

  // 4) Supabase 接続・ログイン済み（UUIDの設問）: insert され synced=true、DB統計が採用される
  const inserts: unknown[] = [];
  const uuidPassage = '11111111-1111-4111-8111-111111111111';
  const uuidQ = '22222222-2222-4222-8222-222222222222';
  const choiceRow = (n: number, trap: string, correct: boolean) => ({
    id: `33333333-3333-4333-8333-33333333333${n}`, question_id: uuidQ, choice_label: n, content: `c${n}`,
    is_correct: correct, primary_trap_type: trap, flaw_segment_text: correct ? null : 'c', clause_breakdown_json: [],
    trap_explanation: 'x',
  });
  const dbPassage = {
    id: uuidPassage, title: 't', author: 'a', source_work: 's', theme: 'CULTURE', difficulty_level: 3, target_tier: 'MARCH',
    char_count: 10, standard_time_seconds: 60, paragraphs_json: [{ paragraphNumber: 1, text: 'abc' }], logical_structure_summary: {},
    questions: [{
      id: uuidQ, passage_id: uuidPassage, question_number: 1, question_type: 'MULTIPLE_CHOICE', prompt_text: 'p',
      target_underline_id: null, correct_choice_label: 1, descriptive_char_limit: null, model_answer_text: null,
      grading_rubric_json: null, logical_derivation_steps: [], explanation_summary: 'e',
      choices: [choiceRow(1, 'NONE', true), choiceRow(2, 'OVERSTATEMENT', false), choiceRow(3, 'CAUSAL_REVERSAL', false), choiceRow(4, 'UNMENTIONED', false)],
    }],
  };
  const dbStats = ['OVERSTATEMENT', 'CAUSAL_REVERSAL', 'CONCEPT_SWAP', 'UNMENTIONED', 'SUBJECT_OBJECT_FLIP', 'PARTIAL_CONTRADICTION'].map((t) => ({
    trap_type: t, encountered_count: 1, trapped_count: 0, correctly_tagged_count: 1, weakness_score: '0.00',
  }));
  const chain = (rows: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
    q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
    q.insert = (row: unknown) => { inserts.push(row); return { select: () => ({ single: async () => ({ data: { id: '44444444-4444-4444-8444-444444444444', created_at: '2026-10-26T00:00:00Z' }, error: null }) }) }; };
    return q;
  };
  const connected = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-uuid' } }, error: null }) },
    from: (table: string) => chain(table === 'passages' ? [dbPassage] : table === 'user_trap_weaknesses' ? dbStats : []),
  } as unknown as SupabaseClient;
  const st4 = memoryStorage();
  const repo4 = createRepository(connected, st4);
  const ps = await repo4.listPassages();
  assert.equal(ps.length, 1);
  assert.equal(ps[0]?.questions[0]?.choices.length, 4);
  const r4 = await repo4.submitAnswer({ passageId: uuidPassage, questionId: uuidQ, selectedChoiceLabel: 2, elimination: {}, timeSpentMs: 5 });
  assert.ok(r4.success && r4.data.synced && r4.data.log.id.startsWith('44444444'));
  assert.equal(inserts.length, 1);
  assert.equal((inserts[0] as { selected_choice_label: number }).selected_choice_label, 2);
  assert.ok(st4.data.has(STORAGE_KEYS.answerLogs));

  console.log('repository tests OK');
}

main().catch((e) => { console.error(e); process.exit(1); });
