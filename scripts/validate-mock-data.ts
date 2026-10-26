import { MOCK_PASSAGES } from '../src/lib/mock-data/passages';

const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

for (const p of MOCK_PASSAGES) {
  const allText = p.paragraphs.map((x) => x.text).join('');
  const underlineIds = new Set<string>();
  for (const para of p.paragraphs) {
    for (const u of para.underlines ?? []) {
      underlineIds.add(u.id);
      if (!para.text.includes(u.text)) fail(`${p.id} ${u.id}: underline text not in paragraph ${para.paragraphNumber}`);
      if (allText.split(u.text).length !== 2) fail(`${p.id} ${u.id}: underline text must appear exactly once`);
    }
  }
  if (p.paragraphs.length !== 4) fail(`${p.id}: expected 4 paragraphs`);

  const nums = new Set<number>();
  for (const q of p.questions) {
    if (nums.has(q.questionNumber)) fail(`${q.id}: duplicate question number`);
    nums.add(q.questionNumber);
    if (q.targetUnderlineId && !underlineIds.has(q.targetUnderlineId)) fail(`${q.id}: unknown underline`);

    if (q.questionType === 'MULTIPLE_CHOICE') {
      if (q.choices.length !== 4) fail(`${q.id}: expected 4 choices`);
      const correct = q.choices.filter((c) => c.isCorrect);
      if (correct.length !== 1) fail(`${q.id}: expected exactly 1 correct`);
      if (correct[0]?.choiceLabel !== q.correctChoiceLabel) fail(`${q.id}: correctChoiceLabel mismatch`);
      const wrongTraps = q.choices.filter((c) => !c.isCorrect).map((c) => c.primaryTrapType);
      if (new Set(wrongTraps).size !== wrongTraps.length) fail(`${q.id}: duplicate trap types among wrong choices`);
      q.choices.forEach((c, i) => {
        if (c.choiceLabel !== i + 1) fail(`${c.id}: label order`);
        if (c.clauseBreakdown.map((x) => x.text).join('') !== c.content) fail(`${c.id}: clauses != content`);
        if (c.isCorrect) {
          if (c.primaryTrapType !== 'NONE' || c.flawSegmentText !== null) fail(`${c.id}: correct choice must have NONE/no flaw`);
          if (c.clauseBreakdown.some((x) => x.status === 'FLAWED')) fail(`${c.id}: correct choice has FLAWED clause`);
        } else {
          if (c.primaryTrapType === 'NONE') fail(`${c.id}: wrong choice needs trap`);
          if (!c.flawSegmentText || !c.content.includes(c.flawSegmentText)) fail(`${c.id}: flaw segment not in content`);
          if (!c.clauseBreakdown.some((x) => x.status === 'FLAWED')) fail(`${c.id}: no FLAWED clause`);
        }
      });
    } else {
      const len = (q.modelAnswerText ?? '').length;
      console.log(`${q.id}: model answer ${len} chars`);
      if (len < 350 || len > (q.descriptiveCharLimit ?? 400)) fail(`${q.id}: model answer length ${len} out of 350-400`);
      const total = (q.gradingRubric ?? []).reduce((s, r) => s + r.points, 0);
      if (total !== 100 || q.gradingRubric?.length !== 4) fail(`${q.id}: rubric must be 4 items summing to 100 (got ${total})`);
      for (const r of q.gradingRubric ?? []) {
        const hits = r.keywords.filter((k) => (q.modelAnswerText ?? '').includes(k));
        if (hits.length < 3) fail(`${q.id}/${r.id}: model answer hits only ${hits.length} keywords`);
      }
    }
  }
  console.log(`${p.id}: ${p.charCount} chars, ${p.questions.length} questions`);
}

if (errors.length) {
  console.error('\nVALIDATION FAILED:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exit(1);
}
console.log('\nmock data OK');
