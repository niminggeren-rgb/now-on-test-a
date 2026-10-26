import { PracticeBrowser } from '@/components/practice/practice-browser';
import { buildTrapIndex, summarizePassage } from '@/lib/passage-summary';
import { createRepository } from '@/lib/repository';
import { createClient } from '@/lib/supabase/server';

export default async function PracticeIndexPage() {
  const repo = createRepository(await createClient(), null);
  const passages = await repo.listPassages();

  return <PracticeBrowser passages={passages.map(summarizePassage)} trapIndex={buildTrapIndex(passages)} />;
}
