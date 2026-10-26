import { DashboardView } from '@/components/dashboard/dashboard-view';
import { buildQuestionIndex, buildTrapIndex } from '@/lib/passage-summary';
import { createRepository } from '@/lib/repository';
import { createClient } from '@/lib/supabase/server';
import { getAppMode } from '@/lib/utils';

export default async function DashboardPage() {
  const supabase = await createClient();
  const passages = await createRepository(supabase, null).listPassages();
  const geminiKey = process.env.GEMINI_API_KEY;

  const first = passages[0];

  return (
    <DashboardView
      questionIndex={buildQuestionIndex(passages)}
      trapIndex={buildTrapIndex(passages)}
      startHref={first ? `/practice/${encodeURIComponent(first.id)}` : '/practice'}
      env={{
        appMode: getAppMode(),
        supabase: supabase !== null,
        gemini: !!geminiKey && !geminiKey.startsWith('your-'),
      }}
    />
  );
}
