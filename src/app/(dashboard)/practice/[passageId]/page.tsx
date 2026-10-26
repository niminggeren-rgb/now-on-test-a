import { notFound } from 'next/navigation';
import { PracticeSession } from '@/components/practice/practice-session';
import { buildPracticeHref } from '@/lib/passage-summary';
import { createRepository } from '@/lib/repository';
import { activeTrapTypeSchema } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ passageId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { passageId } = await params;
  const sp = await searchParams;

  const repo = createRepository(await createClient(), null);
  const passage = await repo.getPassage(passageId);
  if (!passage) notFound();

  const trapParsed = activeTrapTypeSchema.safeParse(first(sp.trap));
  const trapFocus = trapParsed.success ? trapParsed.data : null;
  const queue = (first(sp.queue) ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  const [nextId, ...rest] = queue;
  const nextPassageHref = trapFocus && nextId ? buildPracticeHref(nextId, trapFocus, rest) : null;

  return (
    <PracticeSession
      key={`${passage.id}:${trapFocus ?? ''}`}
      passage={passage}
      trapFocus={trapFocus}
      nextPassageHref={nextPassageHref}
    />
  );
}
