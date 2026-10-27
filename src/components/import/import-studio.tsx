'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  ClipboardPaste,
  Edit3,
  Library,
  Play,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { prepareImageFile, savedPercent, type PreparedImage } from '@/lib/client-image';
import {
  isPlayable,
  MAX_IMPORT_IMAGES,
  MAX_PASTE_CHARS,
  MIN_PASTE_CHARS,
  validateGeneratedMaterial,
  validateImportedMaterial,
} from '@/lib/import-material';
import { customMaterialRepository, type StoredCustomMaterial } from '@/lib/repositories/customMaterialRepository';
import { customPassageCloud } from '@/lib/repositories/customPassageCloud';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/types/action';
import {
  TARGET_LEVEL_LABELS,
  TargetLevelEnum,
  type ImportedMaterial,
  type SourceType,
  type TargetLevel,
} from '@/types/ai-pipeline';
import { MaterialEditor } from './material-editor';

type InputTab = 'text' | 'image';

const LOADING_MESSAGES: Record<InputTab, string[]> = {
  image: [
    '縦書き・段組みテキストをOCRで構造化しています...',
    '本文の対比・因果関係と傍線部の論理構造をマッピング中...',
    '各選択肢のキズを検出し、誤答トラップへ自動分類しています...',
    '消去法スラッシュ演習データを生成しています...',
  ],
  text: [
    '本文を段落に分節し、論理構造を解析しています...',
    '論理の要所に傍線部と設問を配置しています...',
    '重複しないトラップで誤答選択肢と節ごとの傷を設計中...',
    '正解の論理導出と根拠を検証しています...',
  ],
};

export function ImportStudio() {
  const router = useRouter();
  const [tab, setTab] = useState<InputTab>('text');
  const [targetLevel, setTargetLevel] = useState<TargetLevel>('MARCH');
  const [rawText, setRawText] = useState('');
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [material, setMaterial] = useState<ImportedMaterial | null>(null);
  const [sourceType, setSourceType] = useState<SourceType>('TEXT_PASTE');
  const [library, setLibrary] = useState<StoredCustomMaterial[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLibrary(customMaterialRepository.getAllImportedMaterials());
    // ログイン済みなら、他端末で作った教材の取り込みと、未同期の端末内教材のアップロードを行う
    let cancelled = false;
    void customPassageCloud.sync().then((merged) => {
      if (!cancelled) setLibrary(merged);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const warnings = useMemo(() => {
    if (!material) return [];
    const base = validateImportedMaterial(material);
    return sourceType === 'TEXT_PASTE' ? [...base, ...validateGeneratedMaterial(material)] : base;
  }, [material, sourceType]);
  const canStart = material !== null && isPlayable(material);
  const textLength = rawText.trim().length;
  const textReady = textLength >= MIN_PASTE_CHARS && textLength <= MAX_PASTE_CHARS;

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

  const handleGenerate = async () => {
    const source: SourceType = tab === 'text' ? 'TEXT_PASTE' : 'IMAGE_OCR';
    if (source === 'TEXT_PASTE' ? !textReady : images.length === 0) return;
    setIsAnalyzing(true);
    setError(null);
    setLoadingStep(0);
    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => Math.min(prev + 1, LOADING_MESSAGES[tab].length - 1));
    }, source === 'TEXT_PASTE' ? 6000 : 2200);

    try {
      const res = await fetch('/api/ai/import-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          source === 'TEXT_PASTE'
            ? { sourceType: source, rawText: rawText.trim(), targetLevel }
            : {
                sourceType: source,
                targetLevel,
                images: images.map((img) => ({ mimeType: img.mimeType, base64Data: img.base64Data })),
              },
        ),
      });
      const json = (await res.json().catch(() => null)) as ActionResult<ImportedMaterial> | null;
      if (!json || !json.success) {
        throw new Error(json && !json.success ? json.error : '教材の生成に失敗しました。');
      }
      setMaterial(json.data);
      setSourceType(source);
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました。');
    } finally {
      clearInterval(stepInterval);
      setIsAnalyzing(false);
    }
  };

  /** 端末に保存 → クラウドへ同期（非同期・失敗しても演習は続行）→ 演習画面へ */
  const handleSaveAndStart = () => {
    if (!material || !canStart) return;
    const record = customMaterialRepository.saveImportedMaterial(material, { sourceType, targetLevel });
    if (!record) {
      setError('この端末のブラウザに保存できませんでした（容量不足の可能性）。マイ教材ライブラリから古い教材を削除してください。');
      return;
    }
    void customPassageCloud.push(record);
    router.push(`/import/${record.id}`);
  };

  const removeFromLibrary = (id: string) => {
    customMaterialRepository.deleteImportedMaterial(id);
    setLibrary(customMaterialRepository.getAllImportedMaterials());
    void customPassageCloud.remove(id);
  };

  const reset = () => {
    setMaterial(null);
    setImages([]);
    setRawText('');
    setError(null);
  };

  const tabButton = (value: InputTab, label: string, Icon: typeof Camera) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === value}
      onClick={() => setTab(value)}
      className={cn(
        'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors',
        tab === value ? 'bg-foreground text-background' : 'text-muted hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );

  const generateLabel = tab === 'text' ? 'AIで問題を生成する' : 'AIで教材を構造化・問題化する';
  const canGenerate = tab === 'text' ? textReady : images.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2 border-b pb-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Bring Your Own Content
        </span>
        <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">教材インジェクター</h2>
        <p className="text-sm text-muted">
          好きな文章を貼り付ける、または問題集やプリントを撮影するだけで、AIがトラップ分類付きの消去法演習に変換します。
        </p>
      </header>

      {!material && !isAnalyzing && (
        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border bg-surface p-4 md:p-6">
            <div role="tablist" aria-label="入力方法" className="flex gap-1 rounded-lg border bg-background p-1">
              {tabButton('text', 'テキスト貼り付け', ClipboardPaste)}
              {tabButton('image', 'カメラ撮影 / 画像', Camera)}
            </div>

            <label className="block space-y-1.5">
              <span className="block text-xs font-semibold text-muted">志望校レベル</span>
              <select
                value={targetLevel}
                onChange={(e) => setTargetLevel(TargetLevelEnum.parse(e.target.value))}
                className="min-h-11 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-64"
              >
                {TargetLevelEnum.options.map((level) => (
                  <option key={level} value={level}>
                    {TARGET_LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>

            {tab === 'text' ? (
              <div className="space-y-1.5">
                <label htmlFor="paste-text" className="text-xs font-semibold text-muted">
                  評論文のテキスト
                </label>
                <textarea
                  id="paste-text"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  rows={12}
                  placeholder="青空文庫・過去問・新聞の論説など、問題にしたい文章をここに貼り付けます。"
                  className="passage-text w-full resize-y rounded-md border bg-background p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
                <p
                  className={cn(
                    'text-right font-mono text-[11px]',
                    textLength === 0 || textReady ? 'text-muted' : 'text-rose-400',
                  )}
                >
                  {textLength.toLocaleString()} / {MAX_PASTE_CHARS.toLocaleString()} 字
                  {textLength > 0 && textLength < MIN_PASTE_CHARS && `（あと${MIN_PASTE_CHARS - textLength}字必要）`}
                  {textLength > MAX_PASTE_CHARS && '（長すぎます）'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed bg-background/50 p-8 text-center transition-colors hover:border-accent/60"
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
                  <span className="mb-3 flex items-center gap-4 text-accent">
                    <Camera className="h-8 w-8" aria-hidden />
                    <Upload className="h-8 w-8" aria-hidden />
                  </span>
                  <span className="text-base font-bold">タップしてカメラで撮影、または画像を選択</span>
                  <span className="mt-1 text-xs text-muted">
                    本文ページと設問ページを複数枚（最大{MAX_IMPORT_IMAGES}枚）。縦書き・段組みは自動補正します。
                  </span>
                </button>

                {images.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold">取り込み対象ページ ({images.length}枚)</h3>
                        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                          {savedPercent({
                            originalBytes: images.reduce((n, i) => n + i.originalBytes, 0),
                            compressedBytes: images.reduce((n, i) => n + i.compressedBytes, 0),
                          })}
                          %削減 ({images[0]?.mimeType === 'image/webp' ? 'WebP' : 'JPEG'} 1600px)
                        </span>
                      </div>
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
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              <Sparkles className="h-5 w-5" aria-hidden />
              {generateLabel}
            </button>
          </div>

          {library.length > 0 && (
            <section className="rounded-xl border bg-surface p-4 md:p-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <Library className="h-4 w-4 text-accent" aria-hidden />
                マイ教材ライブラリ
              </h3>
              <ul className="divide-y">
                {library.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="font-mono text-[11px] text-muted">
                        {item.createdAt.slice(0, 10)} · {item.questions.length}問
                        {item.targetLevel && ` · ${TARGET_LEVEL_LABELS[item.targetLevel]}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => router.push(`/import/${item.id}`)}
                        className="min-h-9 rounded-md border px-3 text-xs font-semibold hover:text-accent"
                      >
                        演習する
                      </button>
                      <button
                        type="button"
                        aria-label={`${item.title} を削除`}
                        onClick={() => removeFromLibrary(item.id)}
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
                AI generation pipeline
              </p>
              <h3 className="mt-0.5 text-base font-bold md:text-lg">{LOADING_MESSAGES[tab][loadingStep]}</h3>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {LOADING_MESSAGES[tab].map((_, idx) => (
              <div
                key={idx}
                className={cn('h-1.5 rounded-full transition-colors duration-500', idx <= loadingStep ? 'bg-accent' : 'bg-foreground/10')}
              />
            ))}
          </div>
          <p className="text-xs text-muted">通常15〜60秒ほどかかります。このままお待ちください。</p>
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
              <span className="flex min-h-11 items-center gap-2 rounded-md bg-foreground px-4 text-xs font-bold text-background">
                <Edit3 className="h-4 w-4" aria-hidden />
                プレビュー・微調整
              </span>
              <button
                type="button"
                onClick={handleSaveAndStart}
                disabled={!canStart}
                className="flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-xs font-bold text-white disabled:opacity-40"
              >
                <Play className="h-4 w-4" aria-hidden />
                このまま演習を開始
              </button>
            </div>
            <button type="button" onClick={reset} className="min-h-11 px-2 text-xs text-muted hover:text-foreground">
              別の教材を入力する
            </button>
          </div>

          <MaterialEditor
            material={material}
            warnings={warnings}
            canStart={canStart}
            onChange={setMaterial}
            onStart={handleSaveAndStart}
          />
        </div>
      )}
    </div>
  );
}
