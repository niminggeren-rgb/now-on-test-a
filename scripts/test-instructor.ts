import assert from 'node:assert/strict';
import { analyzeFocusTraps, generateTeachingSuggestion } from '../src/lib/instructor';
import { MOCK_STUDENTS } from '../src/lib/mock-data/students';

assert.equal(MOCK_STUDENTS.length, 4);
const byId = (id: string) => MOCK_STUDENTS.find((s) => s.id === id)!;

const sato = generateTeachingSuggestion(byId('student-sato'));
assert.equal(sato.focusTraps[0]?.trap, 'PARTIAL_CONTRADICTION');
assert.equal(sato.focusTraps[0]?.multiplier, 2.4);
assert.equal(sato.strengthTrap, 'CONCEPT_SWAP');
assert.ok(sato.narrative.includes('通常の2.4倍'));
assert.ok(sato.narrative.includes('本文の二項対立を把握するのは速く'));
assert.ok(sato.narrative.includes('3節に区切る'));
assert.ok(sato.narrative.startsWith('佐藤 健太（高3・早稲田大学 政治経済学部志望）'));

const taka = generateTeachingSuggestion(byId('student-takahashi'));
assert.deepEqual(taka.focusTraps.map((f) => f.trap), ['UNMENTIONED', 'CONCEPT_SWAP']);

const ito = generateTeachingSuggestion(byId('student-ito'));
assert.deepEqual(ito.focusTraps.map((f) => f.trap), ['SUBJECT_OBJECT_FLIP', 'OVERSTATEMENT']);

// 全生徒: 診断文が出て、指導アクションが1件以上ある
for (const s of MOCK_STUDENTS) {
  const g = generateTeachingSuggestion(s);
  assert.ok(g.narrative.length > 40 && g.actions.length >= 3, s.name);
}

// サンプル不足のトラップは診断対象外 / データ無しでも落ちない
assert.deepEqual(analyzeFocusTraps([{ trapType: 'OVERSTATEMENT', encounteredCount: 3, trappedCount: 3, correctlyTaggedCount: 0, weaknessScore: 75 }]), []);
const empty = generateTeachingSuggestion({ ...byId('student-sato'), stats: [] });
assert.ok(empty.narrative.includes('十分な演習データ'));
console.log('instructor tests OK');
