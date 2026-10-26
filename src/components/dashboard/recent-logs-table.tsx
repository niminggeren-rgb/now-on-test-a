import { Check, X } from 'lucide-react';
import type { QuestionIndex } from '@/lib/passage-summary';
import { cn } from '@/lib/utils';
import { TRAP_METADATA_MAP, type AnswerLog, type TrapType } from '@/types/domain';

function trapLabel(t: TrapType | null | undefined): string {
  return t && t !== 'NONE' ? TRAP_METADATA_MAP[t].shortLabel : '—';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

export function RecentLogsTable({ logs, questionIndex }: { logs: readonly AnswerLog[]; questionIndex: QuestionIndex }) {
  if (logs.length === 0) {
    return <p className="rounded-lg border bg-surface p-6 text-center text-sm text-muted">まだ演習の記録がありません。</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-surface">
      <table className="w-full min-w-[720px] text-left text-xs">
        <caption className="sr-only">直近の消去プロセス履歴</caption>
        <thead className="border-b text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">日時</th>
            <th scope="col" className="px-3 py-2 font-medium">設問</th>
            <th scope="col" className="px-3 py-2 font-medium">正誤</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">時間</th>
            <th scope="col" className="px-3 py-2 font-medium">あなたのタグ → 実際のトラップ</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const q = questionIndex[log.questionId];
            const entries = Object.entries(log.eliminationTrace)
              .filter(([, t]) => t.actualTrap !== 'NONE')
              .sort(([a], [b]) => Number(a) - Number(b));
            const selectedTrap = log.selectedChoiceLabel !== null ? q?.traps[String(log.selectedChoiceLabel)] : undefined;
            return (
              <tr key={log.id} className="border-b last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-muted">{formatDate(log.createdAt)}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium">{q?.passageTitle ?? '（不明な文章）'}</div>
                  <div className="text-muted">問{q?.questionNumber ?? '?'}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {log.isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="h-3.5 w-3.5" aria-hidden />正解</span>
                  ) : (
                    <span className="inline-flex flex-col gap-0.5 text-rose-400">
                      <span className="inline-flex items-center gap-1"><X className="h-3.5 w-3.5" aria-hidden />不正解</span>
                      {selectedTrap && selectedTrap !== 'NONE' && (
                        <span className="text-[10px] text-muted">引っかかり: {trapLabel(selectedTrap)}</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono">{(log.timeSpentMs / 1000).toFixed(0)}s</td>
                <td className="px-3 py-2.5">
                  {entries.length === 0 ? (
                    <span className="text-muted">消去記録なし</span>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {entries.map(([label, t]) => (
                        <li
                          key={label}
                          className={cn(
                            'rounded border px-1.5 py-0.5',
                            t.isTrapMatch ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border',
                          )}
                        >
                          <span className="font-mono text-muted">{label}</span>{' '}
                          {trapLabel(t.userTaggedTrap)} → {trapLabel(t.actualTrap)}{' '}
                          {t.isTrapMatch ? (
                            <Check className="inline h-3 w-3 text-emerald-400" aria-label="一致" />
                          ) : (
                            <span className="text-muted" aria-label="不一致">×</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
