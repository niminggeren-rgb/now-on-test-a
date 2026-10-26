import { TRAP_METADATA_MAP } from '@/types/domain';
import { getAppMode } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const traps = Object.values(TRAP_METADATA_MAP);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Logical Vernacular</h2>
        <p className="mt-1 text-sm text-muted">
          感覚的な読解を排除し、選択肢の「どこが・どのトラップで誤りか」を構造的に識別する。
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-surface p-3">
            <dt className="text-xs text-muted">アプリモード</dt>
            <dd className="mt-1 font-mono text-sm">{getAppMode()}</dd>
          </div>
          <div className="rounded-lg border bg-surface p-3">
            <dt className="text-xs text-muted">Supabase</dt>
            <dd className="mt-1 font-mono text-sm">{supabase ? 'configured' : 'not configured (mock)'}</dd>
          </div>
          <div className="rounded-lg border bg-surface p-3">
            <dt className="text-xs text-muted">Gemini API</dt>
            <dd className="mt-1 font-mono text-sm">
              {process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('your-')
                ? 'configured'
                : 'not configured (local fallback)'}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">6大トラップ類型</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {traps.map((trap) => (
            <li key={trap.type} className={`rounded-lg border-l-2 border bg-surface p-4 ${trap.borderColorClass}`}>
              <div className="flex items-center gap-2">
                <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">{trap.keyNumber}</kbd>
                <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${trap.badgeColorClass}`}>
                  {trap.shortLabel}
                </span>
                <span className="text-sm font-medium">{trap.label}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">{trap.description}</p>
              <p className="mt-2 text-xs leading-relaxed">
                <span className="text-muted">確認: </span>
                {trap.checkPoint}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
