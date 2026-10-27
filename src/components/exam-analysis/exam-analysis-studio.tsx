'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileQuestion,
  Flame,
  GraduationCap,
  PenTool,
  ScanSearch,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { describeApiFailure } from '@/lib/api-error';
import { EXAM_UPLOAD_COMPRESSION, prepareImageFile, type PreparedImage } from '@/lib/client-image';
import { summarizeDiagnostics } from '@/lib/exam-diagnosis';
import { trapBadgeClass } from '@/lib/import-material';
import { customMaterialRepository, type TrapWeaknessScores } from '@/lib/repositories/customMaterialRepository';
import { cn } from '@/lib/utils';
import type { ActionResult } from '@/types/action';
import { TRAP_LABELS, type ExamAnalysisResult } from '@/types/ai-pipeline';
import { WeaknessRadar } from './weakness-radar';

interface SlotProps {
  index: 1 | 2;
  title: string;
  hint: string;
  icon: typeof FileQuestion;
  image: PreparedImage | null;
  onFile: (file: File) => void;
}

function UploadSlot({ index, title, hint, icon: Icon, image, onFile }: SlotProps) {
  return (
    <label className="group relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-surface/50 p-5 text-center transition-colors hover:border-accent/60 focus-within:border-accent">
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      {image ? (
        <div className="w-full space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.previewUrl} alt={`${title}のプレビュー`} className="mx-auto max-h-48 rounded-lg border object-contain" />
          <p className="text-xs font-bold text-emerald-400">✓ {index}. {title}セット完了（タップで変更）</p>
        </div>
      ) : (
        <div className="space-y-2">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <p className="text-sm font-bold">{index === 1 ? '① ' : '② '}{title}をアップロード</p>
          <p className="text-xs text-muted">{hint}</p>
        </div>
      )}
    </label>
  );
}

export function ExamAnalysisStudio() {
  const [problemImg, setProblemImg] = useState<PreparedImage | null>(null);
  const [answerImg, setAnswerImg] = useState<PreparedImage | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExamAnalysisResult | null>(null);
  const [weaknesses, setWeaknesses] = useState<TrapWeaknessScores | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [rewarded, setRewarded] = useState(false);
  const busy = useRef(false);

  const load = async (file: File, set: (img: PreparedImage) => void) => {
    setError(null);
    try {
      set(await prepareImageFile(file, EXAM_UPLOAD_COMPRESSION));
    } catch {
      setError('この画像形式は読み込めませんでした。JPEG または PNG で撮影・保存してください。');
    }
  };

  const run = async () => {
    if (!problemImg || !answerImg || busy.current) return;
    busy.current = true;
    setIsAnalyzing(true);
    setError(null);
    setSelected(null);
    setSubmitted(false);
    setRewarded(false);
    try {
      const res = await fetch('/api/ai/analyze-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemImage: { mimeType: problemImg.mimeType, base64Data: problemImg.base64Data },
          answerImage: { mimeType: answerImg.mimeType, base64Data: answerImg.base64Data },
        }),
      });
      const json = (await res.json().catch(() => null)) as ActionResult<ExamAnalysisResult> | null;
      if (!json || !json.success) throw new Error(describeApiFailure(res.status, json));

      setResult(json.data);
      // 弱点スコアと講師カルテへ同期（保存できない環境では表示のみ）
      try {
        setWeaknesses(customMaterialRepository.syncExamAnalysisToCarte(json.data).updatedWeaknesses);
        setSyncFailed(false);
      } catch {
        setWeaknesses(customMaterialRepository.getTrapWeaknesses());
        setSyncFailed(true);
      }
    } catch (err) {
      // fetch 自体の失敗（TypeError）は通信の問題。それ以外は上で組み立てた理由をそのまま出す
      setError(err instanceof TypeError ? '通信に失敗しました。ネットワークを確認して、もう一度お試しください。' : err instanceof Error ? err.message : '解析エラーが発生しました。');
    } finally {
      busy.current = false;
      setIsAnalyzing(false);
    }
  };

  const submitRemedial = () => {
    if (!result || !selected || submitted) return;
    setSubmitted(true);
    if (result.remedialQuestion.choices.find((c) => c.id === selected)?.isCorrect && !rewarded) {
      setWeaknesses(customMaterialRepository.rewardTrapOvercome(result.remedialQuestion.targetTrap));
      setRewarded(true);
    }
  };

  const summary = result ? summarizeDiagnostics(result) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
            <ScanSearch className="h-3.5 w-3.5" aria-hidden />
            W-Image Diagnostic &amp; Carte Sync
          </span>
          <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">模試・定期テスト「問題＋答案」W画像解析</h2>
          <p className="text-sm text-muted">
            問題用紙と自分の答案の2枚から、失点トラップと記述の減点要素を診断し、弱点レーダーと講師カルテへ同期します。
          </p>
        </div>
        <Link
          href="/instructor"
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border bg-surface px-4 text-xs font-bold hover:text-accent"
        >
          <GraduationCap className="h-4 w-4 text-accent" aria-hidden />
          講師カルテを確認
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UploadSlot index={1} title="問題用紙" hint="本文・設問・選択肢が写っているページ" icon={FileQuestion} image={problemImg} onFile={(f) => void load(f, setProblemImg)} />
        <UploadSlot index={2} title="生徒の答案" hint="解答用紙、または消去法の書き込みがある問題冊子" icon={PenTool} image={answerImg} onFile={(f) => void load(f, setAnswerImg)} />
      </div>

      <button
        type="button"
        onClick={() => void run()}
        disabled={!problemImg || !answerImg || isAnalyzing}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-white disabled:opacity-40"
      >
        <Sparkles className={cn('h-5 w-5', isAnalyzing && 'animate-pulse')} aria-hidden />
        {isAnalyzing ? '問題と答案を照合し、失点トラップ・記述要素を診断中...' : 'W画像解析を実行し、弱点レーダー＆講師カルテへ同期する'}
      </button>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm" role="alert">
          <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {result && summary && weaknesses && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <section className="space-y-4 rounded-xl border bg-surface p-4 md:p-6 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {syncFailed ? (
                  <span className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-400">
                    この端末に保存できませんでした（表示のみ）
                  </span>
                ) : (
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
                    ✓ 弱点スコア＆講師カルテ同期済み
                  </span>
                )}
                <span className="text-lg font-black">
                  推定得点率 <span className="font-mono text-rose-400">{result.estimatedScoreRate}%</span>
                </span>
              </div>
              <h3 className="text-lg font-bold">{result.examTitle} - 精密診断レポート</h3>
              {summary.total > 0 && (
                <p className="font-mono text-xs text-muted">
                  正解 {summary.correctCount} / {summary.total} 問
                </p>
              )}
              <p className="text-sm leading-relaxed text-muted">{result.overallSummary}</p>
              <div className="space-y-2 rounded-lg border border-accent/30 bg-accent/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-accent">講師カルテへ送信した指導アドバイス</p>
                <p className="text-sm font-bold">「{result.instructorAdvice.headline}」</p>
                <ul className="list-inside list-disc space-y-1 text-xs text-muted">
                  {result.instructorAdvice.actionPlan.map((plan, i) => (
                    <li key={i}>{plan}</li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="rounded-xl border bg-surface p-4 md:p-6 lg:col-span-5">
              <h3 className="mb-2 text-center text-sm font-bold">最新 5大トラップ弱点レーダー（高いほど要注意）</h3>
              <WeaknessRadar scores={weaknesses} />
            </section>
          </div>

          {result.questionDiagnostics.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-lg font-bold">設問別 思考プロセス＆記述要素診断</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {result.questionDiagnostics.map((diag, idx) => (
                  <div key={idx} className="space-y-3 rounded-xl border bg-surface p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold">
                        {diag.questionNumber}（{diag.questionType === 'descriptive' ? '記述' : '選択'}）
                      </span>
                      {diag.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" aria-hidden /> 正解
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-400">
                          <XCircle className="h-4 w-4" aria-hidden /> 失点・減点
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-background p-2.5">
                        <span className="block text-muted">あなたの解答</span>
                        <span className="font-bold">{diag.studentAnswer}</span>
                      </div>
                      <div className="rounded-md bg-background p-2.5">
                        <span className="block text-muted">正解 / 模範要素</span>
                        <span className="font-bold text-emerald-400">{diag.correctAnswer}</span>
                      </div>
                    </div>
                    {!diag.isCorrect && diag.detectedTrap !== 'none' && (
                      <span className={cn('inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-bold', trapBadgeClass(diag.detectedTrap))}>
                        <AlertOctagon className="h-3.5 w-3.5" aria-hidden />
                        引っかかったトラップ: {TRAP_LABELS[diag.detectedTrap]}
                      </span>
                    )}
                    <p className="text-xs leading-relaxed text-muted">{diag.readingErrorAnalysis}</p>
                    {diag.descriptiveRubric.length > 0 && (
                      <div className="space-y-1.5 border-t pt-3">
                        <p className="text-xs font-bold text-muted">記述要素チェック</p>
                        {diag.descriptiveRubric.map((r, rIdx) => (
                          <div key={rIdx} className="space-y-1 rounded-md bg-background p-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{r.requiredElement}</span>
                              <span className={r.achieved ? 'text-emerald-400' : 'text-rose-400'}>{r.achieved ? '〇 充足' : '× 欠落'}</span>
                            </div>
                            <p className="text-muted">{r.feedback}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4 rounded-xl border-2 border-rose-500/40 bg-surface p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-lg font-extrabold">
                <Flame className="h-5 w-5 text-rose-400" aria-hidden />
                弱点克服・即時リベンジ特訓問題
              </h3>
              <span className={cn('rounded-full border px-3 py-1 text-xs font-bold', trapBadgeClass(result.remedialQuestion.targetTrap))}>
                ターゲット: {TRAP_LABELS[result.remedialQuestion.targetTrap]}
              </span>
            </div>
            <p className="passage-text rounded-lg border bg-background p-4 text-sm">{result.remedialQuestion.miniPassage}</p>
            <p className="text-sm font-bold">設問: {result.remedialQuestion.questionText}</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2" role="radiogroup" aria-label="特訓問題の選択肢">
              {result.remedialQuestion.choices.map((c) => {
                const isSelected = selected === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={submitted}
                    onClick={() => setSelected(c.id)}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-colors',
                      isSelected ? 'border-accent bg-accent/10' : 'bg-background hover:border-foreground/30',
                      submitted && c.isCorrect && 'border-emerald-500/60',
                    )}
                  >
                    <span className="mb-1 flex items-center justify-between text-xs font-extrabold">
                      選択肢 [{c.id}]
                      {submitted && (
                        <span className={c.isCorrect ? 'text-emerald-400' : 'text-rose-400'}>{c.isCorrect ? '★ 正解' : '× トラップ'}</span>
                      )}
                    </span>
                    <span className="block text-xs leading-relaxed">{c.text}</span>
                    {submitted && <span className="mt-2 block border-t pt-2 text-[11px] text-muted">{c.explanation}</span>}
                  </button>
                );
              })}
            </div>
            {!submitted ? (
              <button
                type="button"
                onClick={submitRemedial}
                disabled={!selected}
                className="min-h-11 w-full rounded-lg bg-rose-600 text-xs font-bold text-white disabled:opacity-40"
              >
                解答を確定して弱点スコアを改善する
              </button>
            ) : rewarded ? (
              <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-center text-xs font-bold text-emerald-400" role="status">
                見事正解！「{TRAP_LABELS[result.remedialQuestion.targetTrap]}」の弱点スコアが 8pt 改善されました。
              </p>
            ) : (
              <p className="rounded-lg border bg-background p-3 text-center text-xs text-muted" role="status">
                不正解でした。解説を読んで、トラップの見抜き方を確認しましょう。
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
