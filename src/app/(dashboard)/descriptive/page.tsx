import { DescriptiveWorkspace, type DescriptiveEntry } from '@/components/descriptive/descriptive-workspace';
import { createRepository } from '@/lib/repository';
import { createClient } from '@/lib/supabase/server';

export default async function DescriptivePage() {
  const repo = createRepository(await createClient(), null);
  const passages = await repo.listPassages();

  const entries: DescriptiveEntry[] = passages.flatMap((passage) =>
    passage.questions
      .filter((q) => q.questionType === 'DESCRIPTIVE_400' && (q.gradingRubric?.length ?? 0) > 0)
      .map((q) => ({
        passage: { id: passage.id, title: passage.title, author: passage.author, paragraphs: passage.paragraphs },
        question: {
          id: q.id,
          promptText: q.promptText,
          descriptiveCharLimit: q.descriptiveCharLimit,
          gradingRubric: q.gradingRubric,
        },
      })),
  );

  return <DescriptiveWorkspace entries={entries} />;
}
