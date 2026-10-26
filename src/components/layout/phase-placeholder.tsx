import { Construction } from 'lucide-react';

export function PhasePlaceholder({ title, phase, summary }: { title: string; phase: 2 | 3 | 4; summary: string }) {
  return (
    <section className="mx-auto max-w-2xl rounded-lg border bg-surface p-8 text-center">
      <Construction className="mx-auto mb-3 h-6 w-6 text-muted" aria-hidden />
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{summary}</p>
      <p className="mt-4 font-mono text-xs text-muted">Phase {phase} で実装予定</p>
    </section>
  );
}
