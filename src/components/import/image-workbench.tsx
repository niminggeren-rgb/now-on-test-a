'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  CheckSquare,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  PenTool,
  Scissors,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ClassifyAndOcrResult } from '@/app/api/ai/classify-and-ocr/route';
import { useAiStatus } from '@/hooks/use-ai-status';
import { buildTraceLogs } from '@/lib/analytics/ocrTraces';
import { EXAM_UPLOAD_COMPRESSION, prepareImageFile, savedPercent } from '@/lib/client-image';
import { MAX_IMPORT_IMAGES } from '@/lib/import-material';
import { protocolRepository } from '@/lib/repositories/protocolRepository';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/types/action';
import {
  OPTION_TRAP_TYPES,
  SIX_MAJOR_TRAPS,
  VERNACULAR_PROTOCOL_STEPS,
  type ClassifiedPageItem,
  type DocumentPageCategory,
  type OptionTrapType,
  type StudentStep4TraceLog,
} from '@/types/protocol';

const CATEGORY_META: Record<DocumentPageCategory, { label: string; badge: string; icon: typeof FileText }> = {
  passage: { label: '本文', badge: 'border-sky-500/40 bg-sky-500/15 text-sky-400', icon: FileText },
  questions: { label: '設問', badge: 'border-violet-500/40 bg-violet-500/15 text-violet-400', icon: HelpCircle },
  official_answer: { label: '模範解答・解説', badge: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400', icon: CheckSquare },
  student_sheet: { label: '生徒答案（書き込み）', badge: 'border-amber-500/40 bg-amber-500/15 text-amber-400', icon: PenTool },
  diagram: { label: '図表', badge: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-400', icon: ImageIcon },
};

const CATEGORY_FROM_API: Record<ClassifyAndOcrResult['triage'][number]['category'], DocumentPageCategory> = {
  PASSAGE: 'passage',
  QUESTIONS: 'questions',
  MODEL_ANSWER: 'official_answer',
  STUDENT_SHEET: 'student_sheet',
  DIAGRAM_ONLY: 'diagram',
};

interface WorkbenchPage extends ClassifiedPageItem {
  originalBytes: number;
  compressedBytes: number;
}

interface ImageWorkbenchProps {
  /** 取り込んだ本文テキスト（本文ページの OCR 結果を順に連結したもの）を受け取る */
  onCommit?: (payload: { passageText: string; recordedAttempts: number }) => void;
}

/** 教材・答案の写真をまとめて AI で仕分けし、鉛筆（自力）と赤ペン（丸付け）の痕跡を Step 4 のログとして確認・登録する */
export function ImageWorkbench({ onCommit }: ImageWorkbenchProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const aiStatus = useAiStatus();
  const [pages, setPages] = useState<WorkbenchPage[]>([]);
  const [traces, setTraces] = useState<StudentStep4TraceLog[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ClassifyAndOcrResult['pipelineStats'] | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0] ?? null;

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, MAX_IMPORT_IMAGES);
    e.target.value = '';
    if (files.length === 0) return;

    setBusy(true);
    setError(null);
    setCommitted(null);
    try {
      const prepared = await Promise.all(files.map((f) => prepareImageFile(f, EXAM_UPLOAD_COMPRESSION)));
      const res = await fetch('/api/ai/classify-and-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: prepared.map((p) => ({ id: p.id, base64Data: p.base64Data })) }),
      });
      const json = (await res.json().catch(() => null)) as ActionResult<ClassifyAndOcrResult> | null;
      if (!json || !json.success) throw new Error(json && !json.success ? json.error : '画像の解析に失敗しました。');

      const byIndex = new Map(json.data.triage.map((t) => [t.imageIndex, t]));
      const next = prepared.map<WorkbenchPage>((img, i) => {
        const t = byIndex.get(i);
        return {
          id: img.id,
          fileName: files[i]?.name ?? `page-${i + 1}`,
          previewUrl: img.previewUrl,
          pageOrder: i + 1,
          category: t ? CATEGORY_FROM_API[t.category] : 'passage',
          extractedText: t?.extractedRawText ?? '',
          isVerifiedByUser: false,
          originalBytes: img.originalBytes,
          compressedBytes: img.compressedBytes,
        };
      });
      setPages(next);
      setSelectedId(next[0]?.id ?? null);
      setTraces(buildTraceLogs(json.data.analysis));
      setStats(json.data.pipelineStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像解析エラーが発生しました。');
    } finally {
      setBusy(false);
    }
  };

  const patchPage = (id: string, patch: Partial<WorkbenchPage>) => setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const move = (index: number, dir: -1 | 1) =>
    setPages((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next.map((p, i) => ({ ...p, pageOrder: i + 1 }));
    });

  const setTrap = (i: number, trap: OptionTrapType) =>
    setTraces((prev) =>
      prev.map((t, idx) => (idx === i ? { ...t, selectedChoiceTrap: trap, redPenCorrections: { ...t.redPenCorrections, inferredTrapType: trap } } : t)),
    );

  const commit = async () => {
    const passageText = pages
      .filter((p) => p.category === 'passage')
      .map((p) => p.extractedText)
      .join('\n\n');
    // 生徒の選択が読み取れていない設問は、記録しない（推測で埋めない）
    const targets = traces.filter((t) => t.selectedOptionByStudent !== '');
    const batchId = `ocr-${Date.now()}`;
    let recorded = 0;
    for (const t of targets) {
      await protocolRepository.recordAttempt({
        passageId: batchId,
        questionId: `${batchId}-${t.questionLabel}`,
        selectedChoiceId: t.selectedOptionByStudent,
        correctChoiceId: t.correctOptionFromRedPen,
        isCorrect: t.isCorrect,
        selectedChoiceTrap: t.isCorrect ? undefined : t.selectedChoiceTrap,
        allChoicesTraps: t.allChoicesTraps,
        slashSegmentationQuality: t.blackPencilTraces.hasSlashSegmentation ? 1 : 0,
      });
      recorded++;
    }
    setCommitted(recorded);
    onCommit?.({ passageText, recordedAttempts: recorded });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border bg-surface p-4 md:flex-row md:items-center md:p-5">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            答案ワークベンチ（自動仕分け ＆ Step 4 痕跡解析）
          </h3>
          <p className="text-xs text-muted">
            本文・設問・解答・書き込み済みの答案を最大{MAX_IMPORT_IMAGES}枚まとめて選択すると、AIが種別を仕分け、鉛筆（自力の消去）と赤ペン（丸付け）を分けて読み取ります。
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || aiStatus?.gemini === false}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-bold text-white disabled:opacity-50"
        >
          <Upload className="h-4 w-4" aria-hidden />
          {busy ? 'AI仕分け・OCR実行中…' : '画像を選択して解析'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={(e) => void handleFiles(e)} className="hidden" />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden />
          {error}
        </div>
      )}

      {stats && (
        <p className="font-mono text-[11px] text-muted">
          {stats.totalUploadedImages}枚中{stats.stage2RetainedVisualImages}枚のみ詳細解析に使用（画像トークン約{stats.estimatedVisionTokenSavingPercent}%削減）
        </p>
      )}

      {pages.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-12">
          <ul className="space-y-2 lg:col-span-5" aria-label="認識したページ">
            {pages.map((page, idx) => {
              const meta = CATEGORY_META[page.category];
              const Icon = meta.icon;
              return (
                <li key={page.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(page.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedId(page.id)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-2.5', selected?.id === page.id ? 'border-accent bg-accent/5' : 'bg-surface')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={page.previewUrl} alt={page.fileName} className="h-20 w-16 shrink-0 rounded-md border bg-black object-cover" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-xs font-bold">
                        #{page.pageOrder} {page.fileName}
                      </p>
                      <span className={cn('inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold', meta.badge)}>
                        <Icon className="h-3 w-3" aria-hidden />
                        {meta.label}
                      </span>
                      <p className="truncate text-[11px] text-muted">{page.extractedText.slice(0, 50) || 'テキスト未抽出'}</p>
                      <p className="font-mono text-[10px] text-muted">{savedPercent(page)}%削減</p>
                    </div>
                    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                      <button type="button" aria-label="上へ" disabled={idx === 0} onClick={() => move(idx, -1)} className="flex h-8 w-8 items-center justify-center rounded border disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button type="button" aria-label="下へ" disabled={idx === pages.length - 1} onClick={() => move(idx, 1)} className="flex h-8 w-8 items-center justify-center rounded border disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label="削除"
                        onClick={() => setPages((prev) => prev.filter((p) => p.id !== page.id))}
                        className="flex h-8 w-8 items-center justify-center rounded border text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {selected && (
            <div className="space-y-4 rounded-xl border bg-surface p-4 lg:col-span-7">
              <div>
                <p className="mb-1.5 text-xs text-muted">ページ #{selected.pageOrder} の種別（誤りがあれば修正）</p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(CATEGORY_META) as DocumentPageCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={selected.category === cat}
                      onClick={() => patchPage(selected.id, { category: cat, isVerifiedByUser: true })}
                      className={cn('min-h-9 rounded-lg border px-3 text-xs font-semibold', selected.category === cat ? CATEGORY_META[cat].badge : 'text-muted hover:text-foreground')}
                    >
                      {CATEGORY_META[cat].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ocr-text" className="text-xs font-bold">
                  OCR抽出テキスト（段落・誤字を修正できます）
                </label>
                <textarea
                  id="ocr-text"
                  rows={10}
                  value={selected.extractedText}
                  onChange={(e) => patchPage(selected.id, { extractedText: e.target.value })}
                  className="w-full rounded-lg border bg-background p-3 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {traces.length > 0 && (
        <section aria-label="Step 4 答案痕跡ログ" className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
            <Scissors className="h-4 w-4" aria-hidden />
            Step 4 答案痕跡ログ（鉛筆＝自力の消去 / 赤ペン＝丸付け）
          </h3>
          {traces.map((t, i) => (
            <div key={`${t.questionLabel}-${i}`} className="space-y-2 rounded-lg border bg-background p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">
                  {t.questionLabel}：生徒の選択「{t.selectedOptionByStudent || '読み取れず'}」 / 正解「{t.correctOptionFromRedPen}」
                </span>
                <span className={cn('rounded px-2 py-0.5 text-[10px] font-bold', t.isCorrect ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400')}>
                  {t.isCorrect ? '○ 正解' : '× 不正解'}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1 rounded border bg-surface p-2.5">
                  <p className="font-bold">✏️ 鉛筆（自力の痕跡）</p>
                  <p className="text-muted">スラッシュ節分割: {t.blackPencilTraces.hasSlashSegmentation ? 'あり' : 'なし'}</p>
                  <p className="text-muted">消去した選択肢: {t.blackPencilTraces.crossedOutOptions.join(', ') || 'なし'}</p>
                  <p className="text-accent">ボトルネック（推定）: {VERNACULAR_PROTOCOL_STEPS[t.blackPencilTraces.detectedWeakStep].japaneseTitle}</p>
                </div>
                <div className="space-y-1.5 rounded border border-rose-500/20 bg-rose-500/5 p-2.5">
                  <p className="font-bold text-rose-400">🖍️ 赤ペン（丸付け）</p>
                  <p className="text-muted">メモ: {t.redPenCorrections.writtenMemo || 'なし'}</p>
                  {!t.isCorrect && (
                    <label className="block">
                      <span className="mb-1 block text-[10px] text-muted">引っかかったトラップ</span>
                      <select
                        value={t.selectedChoiceTrap ?? ''}
                        onChange={(e) => setTrap(i, e.target.value as OptionTrapType)}
                        className="min-h-9 w-full rounded border bg-background px-2 text-xs"
                      >
                        <option value="" disabled>
                          選択してください
                        </option>
                        {OPTION_TRAP_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {SIX_MAJOR_TRAPS[type].label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {committed !== null && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-400" role="status">
                <CheckCircle className="h-4 w-4" aria-hidden />
                {committed}問を弱点マトリクスに登録しました
              </p>
            )}
            <button
              type="button"
              onClick={() => void commit()}
              disabled={committed !== null}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" aria-hidden />
              この内容を弱点マトリクスに登録する
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
