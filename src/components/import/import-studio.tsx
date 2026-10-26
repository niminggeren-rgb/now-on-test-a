'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Edit3,
  Library,
  Play,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { prepareImageFile, type PreparedImage } from '@/lib/client-image';
import { isPlayable, MAX_IMPORT_IMAGES, validateImportedMaterial } from '@/lib/import-material';
import { customMaterialRepository, type StoredCustomMaterial } from '@/lib/repositories/customMaterialRepository';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/types/action';
import type { ImportedMaterial } from '@/types/ai-pipeline';
import { MaterialEditor } from './material-editor';
import { MaterialPractice } from './material-practice';

const LOADING_MESSAGES = [
  '縦書き・段組みテキストをOCRで構造化しています...',
  '本文の対比・因果関係と傍線部の論理構造をマッピング中...',
  '各選択肢のキズを検出し、5大誤答トラップへ自動分類しています...',
  '消去法スラッシュ演習データを生成しています...',
];

export function ImportStudio() {
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [material, setMaterial] = useState<ImportedMaterial | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'practice'>('edit');
  const [savedNotice, setSavedNotice] = useState(false);
  const [library, setLibrary] = useState<StoredCustomMaterial[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLibrary(customMaterialRepository.getAllImportedMaterials());
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const warnings = useMemo(() => (material ? validateImportedMaterial(material) : []), [material]);
  const canStart = material !== null && isPlayable(material);

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const room = MAX_IMPORT_IMAGES - images.length;
    const picked = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
    if (picked.length === 0) {
      setError(room <= 0 ? `画像は最大${MAX_IMPORT_IMAGES}枚までです。` : '画像ファイルを選択してください。');
      return;
    }
    try {
      const prepared = await Promise.all(picked.map(prepareImageFile));
      setImages((prev) => [...prev, ...prepared]);
    } catch {
      setError('この画像形式は読み込めませんでした。JPEG または PNG で撮影・保存してください。');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAnalyze = async () => {
    if (images.length === 0) return;
    setIsAnalyzing(true);
    setError(null);
    setLoadingStep(0);
    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => Math.min(prev + 1, LOADING_MESSAGES.length - 1));
    }, 2200);

    try {
      const res = await fetch('/api/ai/import-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: images.map((img) => ({ mimeType: img.mimeType, base64Data: img.base64Data })),
        }),
      });
      const json = (await res.json().catch(() => null)) as ActionResult<ImportedMaterial> | null;
      if (!json || !json.success) {
        throw new Error(json && !json.success ? json.error : '教材の解析に失敗しました。');
      }
      setMaterial(json.data);
      setSavedId(null);
      setMode('edit');
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました。');
    } finally {
      clearInterval(stepInterval);
      setIsAnalyzing(false);
    }
  };

  const handleSaveAndStart = () => {
    if (!material || !canStart) return;
    const record = savedId
      ? customMaterialRepository.updateImportedMaterial(savedId, material)
      : customMaterialRepository.saveImportedMaterial(material);
    if (!record) {
      setError('この端末のブラウザに保存できませんでした（容量不足の可能性）。このまま演習のみ行えます。');
    } else {
      setSavedId(record.id);
      setLibrary(customMaterialRepository.getAllImportedMaterials());
      setSavedNotice(true);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setSavedNotice(false), 3500);
    }
    setMode('practice');
  };

  const openFromLibrary = (item: StoredCustomMaterial) => {
    const { id, createdAt: _createdAt, ...rest } = item;
    void _createdAt;
    setMaterial(rest);
    setSavedId(id);
    setError(null);
    setMode('practice');
  };

  const reset = () => {
    setMaterial(null);
    setSavedId(null);
    setImages([]);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2 border-b pb-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Bring Your Own Content
        </span>
        <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">
          リアル教材カメラ取り込み・即時演習化エンジン
        </h2>
        <p className="text-sm text-muted">
          市販の問題集・学校のプリント・過去問を撮影するだけで、AIがトラップ分類付きの消去法演習データへ変換します。
        </p>
      </header>

      {!material && !isAnalyzing && (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface/50 p-8 text-center transition-colors hover:border-accent/60 md:p-10"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => void handleFilesSelected(e.target.files)}
              className="hidden"
            />
            <span className="mb-4 flex items-center gap-4 text-accent">
              <Camera className="h-8 w-8" aria-hidden />
              <Upload className="h-8 w-8" aria-hidden />
            </span>
            <span className="text-base font-bold">タップしてカメラで撮影、または問題用紙の画像を選択</span>
            <span className="mt-1 text-xs text-muted">
              本文ページと設問ページを複数枚（最大{MAX_IMPORT_IMAGES}枚）。縦書き・段組みは自動補正します。
            </span>
          </button>

          {images.length > 0 && (
            <div className="rounded-xl border bg-surface p-4 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold">取り込み対象ページ ({images.length}枚)</h3>
                <button
                  type="button"
                  onClick={() => setImages([])}
                  className="flex min-h-9 items-center gap-1 text-xs text-muted hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  すべてクリア
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {images.map((img, index) => (
                  <div key={img.id} className="relative aspect-[3/4] overflow-hidden rounded-lg border bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewUrl} alt={`ページ ${index + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 rounded bg-black/80 px-2 py-0.5 font-mono text-xs font-bold text-white">
                      P.{index + 1}
                    </span>
                    <button
                      type="button"
                      aria-label={`ページ ${index + 1} を削除`}
                      onClick={() => setImages((prev) => prev.filter((item) => item.id !== img.id))}
                      className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/80 text-white"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-white"
              >
                <Sparkles className="h-5 w-5" aria-hidden />
                Gemini 2.5 で教材を構造化・トラップ自動解析する
              </button>
            </div>
          )}

          {library.length > 0 && (
            <section className="rounded-xl border bg-surface p-4 md:p-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Library className="h-4 w-4 text-accent" aria-hidden />
                マイ教材ライブラリ（この端末に保存）
              </h3>
              <ul className="divide-y">
                {library.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="font-mono text-[11px] text-muted">
                        {item.createdAt.slice(0, 10)} · {item.questions.length}問
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openFromLibrary(item)}
                        className="min-h-9 rounded-md border px-3 text-xs font-semibold hover:text-accent"
                      >
                        演習する
                      </button>
                      <button
                        type="button"
                        aria-label={`${item.title} を削除`}
                        onClick={() => {
                          customMaterialRepository.deleteImportedMaterial(item.id);
                          setLibrary(customMaterialRepository.getAllImportedMaterials());
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-foreground"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {isAnalyzing && (
        <div className="space-y-6 rounded-xl border border-accent/30 bg-surface p-6 md:p-8" role="status" aria-live="polite">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 animate-spin items-center justify-center rounded-lg border border-accent/40 bg-accent/15">
              <Sparkles className="h-6 w-6 text-accent" aria-hidden />
            </div>
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-accent">
                AI multimodal parsing pipeline
              </p>
              <h3 className="mt-0.5 text-base font-bold md:text-lg">{LOADING_MESSAGES[loadingStep]}</h3>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {LOADING_MESSAGES.map((_, idx) => (
              <div
                key={idx}
                className={cn('h-1.5 rounded-full transition-colors duration-500', idx <= loadingStep ? 'bg-accent' : 'bg-foreground/10')}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
            <div className="animate-pulse space-y-3 rounded-lg border bg-background p-5">
              <div className="h-4 w-1/3 rounded bg-foreground/10" />
              <div className="h-3 w-full rounded bg-foreground/10" />
              <div className="h-3 w-11/12 rounded bg-foreground/10" />
              <div className="h-3 w-4/5 rounded bg-foreground/10" />
              <div className="h-24 w-full rounded bg-foreground/5" />
            </div>
            <div className="animate-pulse space-y-3 rounded-lg border bg-background p-5">
              <div className="h-4 w-1/2 rounded bg-foreground/10" />
              <div className="h-12 w-full rounded bg-foreground/5" />
              <div className="h-12 w-full rounded bg-foreground/5" />
              <div className="h-12 w-full rounded bg-foreground/5" />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm" role="alert">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {material && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('edit')}
                aria-pressed={mode === 'edit'}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-md px-4 text-xs font-bold',
                  mode === 'edit' ? 'bg-foreground text-background' : 'text-muted hover:text-foreground',
                )}
              >
                <Edit3 className="h-4 w-4" aria-hidden />
                1. OCR確認・微調整
              </button>
              <button
                type="button"
                onClick={handleSaveAndStart}
                disabled={!canStart}
                aria-pressed={mode === 'practice'}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-md px-4 text-xs font-bold disabled:opacity-40',
                  mode === 'practice' ? 'bg-accent text-white' : 'border border-accent/40 bg-accent/10 text-accent',
                )}
              >
                <Play className="h-4 w-4" aria-hidden />
                2. 保存して消去法演習を開始
              </button>
            </div>
            <button type="button" onClick={reset} className="min-h-11 px-2 text-xs text-muted hover:text-foreground">
              別の教材を取り込む
            </button>
          </div>

          {savedNotice && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-400" role="status">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              マイ教材ライブラリに保存しました。このまま消去法演習を行えます。
            </div>
          )}

          {mode === 'edit' ? (
            <MaterialEditor
              material={material}
              warnings={warnings}
              canStart={canStart}
              onChange={setMaterial}
              onStart={handleSaveAndStart}
            />
          ) : (
            <MaterialPractice material={material} />
          )}
        </div>
      )}
    </div>
  );
}
