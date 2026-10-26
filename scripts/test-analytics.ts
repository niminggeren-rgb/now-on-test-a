import assert from 'node:assert/strict';
import { buildPrescription, computeKpis, severityOf, toTrapRates } from '../src/lib/analytics';
import { INITIAL_ANSWER_LOGS, INITIAL_TRAP_STATS } from './fixtures/sample-analytics';

const rates = toTrapRates(INITIAL_TRAP_STATS);
assert.equal(rates.length, 6);
const partial = rates.find((r) => r.trapType === 'PARTIAL_CONTRADICTION')!;
assert.equal(partial.encountered, 24);
assert.equal(partial.trappedRate, 54.2); // 13/24
assert.equal(partial.detectRate, 33.3); // 8/24

const k = computeKpis(INITIAL_TRAP_STATS, INITIAL_ANSWER_LOGS);
assert.equal(k.worstTrap?.trapType, 'PARTIAL_CONTRADICTION');
assert.equal(k.accuracySample, 10);
assert.equal(k.accuracy, 40); // 4/10
assert.equal(k.avgSeconds, 135);
assert.ok(k.logicPrecision! > 60 && k.logicPrecision! < 80);

// 空データでも落ちない
const empty = computeKpis([], []);
assert.deepEqual([empty.logicPrecision, empty.accuracy, empty.avgSeconds, empty.worstTrap], [null, null, null, null]);
assert.ok(toTrapRates([]).every((r) => r.trappedRate === 0 && r.detectRate === 0));

assert.equal(severityOf(57.29), 'critical');
assert.equal(severityOf(30), 'caution');
assert.equal(severityOf(14), 'good');
const rx = buildPrescription(INITIAL_TRAP_STATS.find((s) => s.trapType === 'PARTIAL_CONTRADICTION')!);
assert.ok(rx.evidence.includes('54.2%') && rx.drill.includes('「／」'));
console.log('analytics tests OK');
