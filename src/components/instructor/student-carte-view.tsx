'use client';

import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { FileText, MessageSquarePlus, Printer, Users } from 'lucide-react';
import { SeverityBadge, TrapAnalysisPanel } from '@/components/dashboard/trap-analysis-panel';
import { ScoreTrendChart } from '@/components/mock-exams/score-trend-chart';
import { generateTeachingSuggestion } from '@/lib/instructor';
import { TIER_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { TRAP_METADATA_MAP } from '@/types/domain';
import type { InstructorComment, StudentRecord } from '@/types/instructor';

const STORAGE_KEY = 'lv:v1:instructor-comments';

const commentSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  attemptId: z.string().nullable(),
  text: z.string(),
  createdAt: z.string(),
});

function loadComments(students: readonly StudentRecord[]): InstructorComment[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = z.array(commentSchema).safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;
    }
  } catch {
    // 初期データへフォールバック
  }
  return students.flatMap((s) => s.seedComments);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

function CommentThread({
  comments,
  studentId,
  attemptId,
  canEdit,
  onAdd,
}: {
  comments: readonly InstructorComment[];
  studentId: string;
  attemptId: string | null;
  canEdit: boolean;
  onAdd: (c: InstructorComment) => void;
}) {
  const [text, setText] = useState('');
  const mine = comments
    .filter((c) => c.studentId === studentId && c.attemptId === attemptId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd({
      id: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      studentId,
      attemptId,
      text: trimmed.slice(0, 1000),
      createdAt: new Date().toISOString(),
    });
    setText('');
  }

  return (
    <div className="space-y-2">
      {mine.length > 0 && (
        <ul className="space-y-1.5" aria-label="講師コメント">
          {mine.map((c) => (
            <li key={c.id} className="rounded-md border-l-2 border-accent bg-accent/5 px-2.5 py-1.5 text-xs leading-relaxed">
              <p className="whitespace-pre-wrap">{c.text}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted">講師 · {formatDateTime(c.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex gap-2 print:hidden">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={1000}
            aria-label={attemptId ? '答案へのコメント' : '全体コメント'}
            placeholder={attemptId ? 'この答案へのコメント' : '生徒全体への指導メモ'}
            className="min-w-0 flex-1 rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className="flex h-fit items-center gap-1 self-end rounded-md border px-2.5 py-1.5 text-xs hover:bg-foreground/5 disabled:opacity-40"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
            追記
          </button>
        </div>
      )}
    </div>
  );
}

export function StudentCarteView({ students }: { students: readonly StudentRecord[] }) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? '');
  const [comments, setComments] = useState<InstructorComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [cleanView, setCleanView] = useState(false);
  const [today, setToday] = useState('');

  useEffect(() => {
    setComments(loadComments(students));
    setLoaded(true);
    setToday(new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }));
  }, [students]);

  const student = students.find((s) => s.id === studentId) ?? students[0];
  const suggestion = useMemo(() => (student ? generateTeachingSuggestion(student) : null), [student]);

  function addComment(c: InstructorComment) {
    setComments((prev) => {
      const next = [...prev, c];
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 保存はベストエフォート
      }
      return next;
    });
  }

  if (!student || !suggestion) {
    return <p className="mx-auto max-w-md rounded-lg border bg-surface p-8 text-center text-sm text-muted">担当生徒が登録されていません。</p>;
  }

  const latestExam = [...student.exams].sort((a, b) => b.examDate.localeCompare(a.examDate))[0];
  const kpis = [
    { label: '選択問題 正答率', value: `${student.accuracy}%` },
    { label: '平均解答時間', value: `${student.avgSeconds}秒/問` },
    { label: '連続学習', value: `${student.streakDays}日` },
    { label: '直近の偏差値', value: latestExam ? latestExam.deviationValue.toFixed(1) : '—' },
  ];

  return (
    <div className={cn('mx-auto max-w-5xl space-y-6', cleanView && 'theme-paper rounded-lg border p-8 print:border-0 print:p-0')}>
      <div className={cn('flex flex-wrap items-center gap-3 print:hidden', cleanView && 'justify-end')}>
        {!cleanView && (
          <div role="tablist" aria-label="担当生徒" className="flex flex-wrap items-center gap-1.5">
            <Users className="mr-1 h-4 w-4 text-muted" aria-hidden />
            {students.map((s) => (
              <button
                key={s.id}
                role="tab"
                type="button"
                aria-selected={s.id === student.id}
                onClick={() => setStudentId(s.id)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs',
                  s.id === student.id ? 'border-accent bg-accent/15 font-medium' : 'text-muted hover:text-foreground',
                )}
              >
                {s.name}
                <span className="ml-1.5 text-[10px] text-muted">{TIER_LABELS[s.targetTier]}</span>
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setCleanView((v) => !v)}
            aria-pressed={cleanView}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-foreground/5"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden />
            {cleanView ? '編集表示に戻る' : '出力用レイアウト'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            印刷 / PDF保存
          </button>
        </div>
      </div>

      <article aria-label={`${student.name}の学習カルテ`} className="space-y-6" data-testid="carte">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b pb-3">
          <div>
            <p className="text-[11px] text-muted">現代文 論理消去 学習カルテ</p>
            <h2 className="text-xl font-bold tracking-tight" data-testid="carte-name">{student.name}</h2>
            <p className="text-xs text-muted">
              {student.grade} · {student.targetUniversity}志望（{TIER_LABELS[student.targetTier]}）
            </p>
          </div>
          <p className="font-mono text-[11px] text-muted">出力日 {today}</p>
        </header>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border bg-surface p-3">
              <dt className="text-[11px] text-muted">{k.label}</dt>
              <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{k.value}</dd>
            </div>
          ))}
        </dl>

        <section aria-label="思考の癖・誤答トラップ診断" className="rounded-lg border bg-surface p-4">
          <h3 className="mb-2 text-sm font-semibold">思考の癖・誤答トラップ診断</h3>
          <p className="text-sm leading-relaxed" data-testid="diagnosis">{suggestion.narrative}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestion.focusTraps.map((f) => (
              <span
                key={f.trap}
                className={cn('rounded border px-2 py-1 text-xs', TRAP_METADATA_MAP[f.trap].badgeColorClass)}
              >
                {TRAP_METADATA_MAP[f.trap].shortLabel} 一般の{f.multiplier.toFixed(1)}倍
              </span>
            ))}
          </div>
          <h4 className="mb-1.5 mt-4 text-xs font-semibold text-muted">指導者向けティーチングサジェスト</h4>
          <ul className="list-inside list-disc space-y-1 text-xs leading-relaxed">
            {suggestion.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <p className="mt-3 text-[10px] leading-relaxed text-muted">
            ※ 倍率は、一般的な生徒の引っかかり率の目安値（デモ用の定数）に対する比です。生徒データはデモ用の架空のものです。
          </p>
        </section>

        <section aria-label="トラップ別弱点分析" className="rounded-lg border bg-surface p-4 print:break-inside-avoid">
          <h3 className="mb-3 text-sm font-semibold">トラップ別弱点分析</h3>
          <TrapAnalysisPanel key={student.id} stats={student.stats} />
        </section>

        <section aria-label="模試の推移" className="rounded-lg border bg-surface p-4 print:break-inside-avoid">
          <h3 className="mb-3 text-sm font-semibold">模試の推移</h3>
          <ScoreTrendChart exams={student.exams} />
        </section>

        <section aria-label="記述答案の添削履歴" className="space-y-3">
          <h3 className="text-sm font-semibold">記述答案の添削履歴</h3>
          {student.descriptiveAttempts.length === 0 && <p className="text-xs text-muted">添削履歴がありません。</p>}
          {[...student.descriptiveAttempts]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((a) => (
              <div key={a.id} className="space-y-3 rounded-lg border bg-surface p-4 print:break-inside-avoid" data-testid="attempt">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-mono text-2xl font-bold tabular-nums">{a.score}<span className="ml-0.5 text-xs font-normal text-muted">/100</span></span>
                  <span className="text-sm font-medium">{a.passageTitle}</span>
                  <span className="font-mono text-[11px] text-muted">{a.date}</span>
                  <SeverityBadge score={100 - a.score} />
                </div>
                <p className="text-[11px] text-muted">{a.promptSummary}</p>
                <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {a.rubric.map((r) => (
                    <li key={r.element} className="text-[11px]">
                      <div className="flex justify-between gap-2">
                        <span>{r.element}</span>
                        <span className="font-mono">{r.earned}/{r.max}</span>
                      </div>
                      <div className="mt-0.5 h-1 rounded-full bg-foreground/10">
                        <div className="h-full rounded-full" style={{ width: `${(r.earned / r.max) * 100}%`, background: 'var(--series-1)' }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <blockquote className="rounded-md border bg-background/60 p-3 font-serif text-[13px] leading-relaxed text-muted">{a.answerExcerpt}…</blockquote>
                <p className="text-xs leading-relaxed"><span className="font-semibold">AI添削: </span>{a.aiFeedback}</p>
                {loaded && (
                  <CommentThread comments={comments} studentId={student.id} attemptId={a.id} canEdit={!cleanView} onAdd={addComment} />
                )}
              </div>
            ))}
        </section>

        <section aria-label="全体コメント" className="rounded-lg border bg-surface p-4 print:break-inside-avoid">
          <h3 className="mb-2 text-sm font-semibold">講師メモ（全体）</h3>
          {loaded && <CommentThread comments={comments} studentId={student.id} attemptId={null} canEdit={!cleanView} onAdd={addComment} />}
        </section>
      </article>
    </div>
  );
}
