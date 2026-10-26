'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, Loader2, Save, Sparkles, X } from 'lucide-react';
import {
  ALLOWED_IMAGE_TYPES,
  examAnalysisSchema,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  toAnalysisSummary,
  type ExamAnalysis,
} from '@/lib/exam-analysis';
import type { Repository } from '@/lib/repository';
import { actionResultSchemaOf } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { TRAP_METADATA_MAP, type ActiveTrapType, type MockExamRecord } from '@/types/domain';

interface Picked {
  id: string;
  file: File;
  url: string;
}

const responseSchema = actionResultSchemaOf(examAnalysisSchema);

function TrapBadge({ trap }: { trap: ActiveTrapType }) {
  const m = TRAP_METADATA_MAP[trap];
  return <span className={cn('rounded border px-1.5 py-0.5 text-[11px] font-medium', m.badgeColorClass)}>{m.shortLabel}</span>;
}

interface ExamSheetDropzoneProps {
  repo: Repository;
  exams: readonly MockExamRecord[];
  /** 演習データ上の弱点トラップ（解析の参考情報として送る） */
  weakTraps: readonly ActiveTrapType[];
  onSaved: (record: MockExamRecord) => void;
}

export function ExamSheetDropzone({ repo, exams, weakTraps, onSaved }: ExamSheetDropzoneProps) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<ExamAnalysis | null>(null);
  const [saveTarget, setSaveTarget] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const urlsRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);

  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      abortRef.current?.abort();
    },
    [],
  );

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list);
    const problems: string[] = [];
    const accepted: Picked[] = [];
    for (const file of incoming) {
      if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
        problems.push(`「${file.name}」は PNG / JPG ではありません`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        problems.push(`「${file.name}」は4MBを超えています`);
      } else {
        const url = URL.createObjectURL(file);
        urlsRef.current.push(url);
        accepted.push({ id: `img-${++idRef.current}`, file, url });
      }
    }
    setPicked((prev) => {
      const merged = [...prev, ...accepted];
      if (merged.length > MAX_IMAGES) {
        problems.push(`画像は最大${MAX_IMAGES}枚までです`);
        for (const extra of merged.slice(MAX_IMAGES)) {
          URL.revokeObjectURL(extra.url);
          urlsRef.current = urlsRef.current.filter((u) => u !== extra.url);
        }
        return merged.slice(0, MAX_IMAGES);
      }
      return merged;
    });
    setError(problems.join(' / '));
    setAnalysis(null);
    setSavedMsg('');
  }, []);

  function remove(id: string) {
    setPicked((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
        urlsRef.current = urlsRef.current.filter((u) => u !== target.url);
      }
      return prev.filter((p) => p.id !== id);
    });
    setAnalysis(null);
  }

  async function runAnalysis() {
    if (picked.length === 0 || loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    setSavedMsg('');
    try {
      const form = new FormData();
      for (const p of picked) form.append('files', p.file);
      if (weakTraps.length > 0) form.append('weakTraps', weakTraps.join(','));
      const res = await fetch('/api/ai/analyze-exam-sheet', { method: 'POST', body: form, signal: controller.signal });
      const parsed = responseSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) setError('解析結果を受け取れませんでした。時間をおいて再度お試しください。');
      else if (!parsed.data.success) setError(parsed.data.error);
      else {
        setAnalysis(parsed.data.data);
        setSaveTarget((cur) => cur || [...exams].sort((a, b) => b.examDate.localeCompare(a.examDate))[0]?.id || '');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError('通信に失敗しました。ネットワークを確認して再度お試しください。');
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }

  async function save() {
    if (!analysis || !saveTarget) return;
    const res = await repo.attachExamAnalysis(saveTarget, toAnalysisSummary(analysis));
    if (res.success) {
      onSaved(res.data);
      setSavedMsg(`「${res.data.examName}」の記録に保存しました`);
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors focus-within:ring-2 focus-within:ring-accent',
          dragging ? 'border-accent bg-accent/10' : 'border-border hover:border-accent/60',
        )}
      >
        <ImagePlus className="h-6 w-6 text-muted" aria-hidden />
        <span className="text-sm">答案用紙・問題用紙の写真をドラッグ＆ドロップ</span>
        <span className="text-xs text-muted">またはクリックして選択 · PNG / JPG · 1枚4MBまで · 最大{MAX_IMAGES}枚</span>
        <input
          type="file"
          multiple
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          data-testid="exam-file-input"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      {picked.length > 0 && (
        <ul className="grid grid-cols-3 gap-3" aria-label="選択した画像">
          {picked.map((p) => (
            <li key={p.id} className="relative overflow-hidden rounded-md border bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`プレビュー: ${p.file.name}`} className="h-32 w-full object-cover" />
              <div className="truncate px-2 py-1 text-[11px] text-muted">{p.file.name}</div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={`${p.file.name} を削除`}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void runAnalysis()}
        disabled={picked.length === 0 || loading}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-white enabled:hover:opacity-90 disabled:opacity-40"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
        {loading ? '解析中…' : 'AI答案解析を実行'}
      </button>

      <p role="alert" className="min-h-4 text-xs text-rose-400">
        {error}
      </p>

      {analysis && (
        <section aria-label="解析レポート" data-testid="analysis-report" className="space-y-4 rounded-lg border bg-surface p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">答案解析レポート</h3>
            <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted" data-testid="analysis-source">
              {analysis.source === 'gemini' ? 'Gemini 解析' : 'シミュレーション'}
            </span>
          </div>
          {analysis.notice && (
            <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {analysis.notice}
            </p>
          )}
          <p className="text-sm leading-relaxed">{analysis.summary}</p>

          {analysis.choiceTendencies.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-muted">選択問題の消去ミス傾向</h4>
              <ul className="space-y-2">
                {analysis.choiceTendencies.map((t, i) => (
                  <li key={i} className="rounded-md border bg-background/60 p-2.5 text-xs leading-relaxed">
                    <TrapBadge trap={t.trap} />
                    <p className="mt-1.5">{t.observation}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.descriptiveIssues.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-muted">記述問題の要素抜け・減点原因</h4>
              <ul className="space-y-2">
                {analysis.descriptiveIssues.map((d, i) => (
                  <li key={i} className="rounded-md border-l-2 border-amber-500/60 bg-amber-500/5 px-2.5 py-2 text-xs leading-relaxed">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{d.item}</span>
                      {d.lostPoints && <span className="font-mono text-muted">−{d.lostPoints}</span>}
                    </div>
                    <p className="mt-0.5 text-muted">{d.cause}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.focusTraps.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-muted">次回模試に向けた重点対策トラップ</h4>
              <ul className="space-y-1.5">
                {analysis.focusTraps.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                    <TrapBadge trap={f.trap} />
                    <span>{f.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.nextActions.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-muted">次のアクション</h4>
              <ol className="list-inside list-decimal space-y-1 text-xs leading-relaxed">
                {analysis.nextActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ol>
            </div>
          )}

          {exams.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <label className="text-xs text-muted" htmlFor="save-target">
                この分析を保存する模試
              </label>
              <select
                id="save-target"
                value={saveTarget}
                onChange={(e) => setSaveTarget(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-xs"
              >
                {[...exams]
                  .sort((a, b) => b.examDate.localeCompare(a.examDate))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.examDate} {e.examName}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => void save()}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-foreground/5"
              >
                <Save className="h-3.5 w-3.5" aria-hidden />
                保存
              </button>
              <span role="status" className="text-xs text-emerald-400">
                {savedMsg}
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
