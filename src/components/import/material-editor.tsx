'use client';

import { AlertTriangle, ArrowRight, FileText, ShieldAlert } from 'lucide-react';
import { TRAP_LABELS, type ImportedMaterial, type TrapType } from '@/types/ai-pipeline';

interface MaterialEditorProps {
  material: ImportedMaterial;
  warnings: string[];
  canStart: boolean;
  onChange: (next: ImportedMaterial) => void;
  onStart: () => void;
}

const inputClass =
  'w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none';

export function MaterialEditor({ material, warnings, canStart, onChange, onStart }: MaterialEditorProps) {
  const setQuestion = (qIdx: number, patch: Partial<ImportedMaterial['questions'][number]>) => {
    const questions = material.questions.map((q, i) => (i === qIdx ? { ...q, ...patch } : q));
    onChange({ ...material, questions });
  };

  const setChoice = (
    qIdx: number,
    cIdx: number,
    patch: Partial<ImportedMaterial['questions'][number]['choices'][number]>,
  ) => {
    const q = material.questions[qIdx];
    if (!q) return;
    setQuestion(qIdx, { choices: q.choices.map((c, i) => (i === cIdx ? { ...c, ...patch } : c)) });
  };

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm" role="status">
          <p className="flex items-center gap-2 font-semibold text-amber-400">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            AIの読み取りに要確認の箇所があります
          </p>
          <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-muted">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-4 rounded-lg border bg-surface p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-accent" aria-hidden />
            抽出された本文・段落（直接編集できます）
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted">
              タイトル / テーマ
              <input
                value={material.title}
                onChange={(e) => onChange({ ...material, title: e.target.value })}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block text-xs text-muted">
              著者・出典
              <input
                value={material.author}
                onChange={(e) => onChange({ ...material, author: e.target.value })}
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>
          <div className="max-h-[60dvh] space-y-3 overflow-y-auto pr-1">
            {material.paragraphs.map((p, idx) => (
              <label key={p.paragraphNumber} className="block space-y-1">
                <span className="font-mono text-xs font-bold text-muted">第 {p.paragraphNumber} 段落</span>
                <textarea
                  rows={5}
                  value={p.content}
                  onChange={(e) =>
                    onChange({
                      ...material,
                      paragraphs: material.paragraphs.map((x, i) =>
                        i === idx ? { ...x, content: e.target.value } : x,
                      ),
                    })
                  }
                  className={`${inputClass} font-serif leading-relaxed`}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-lg border bg-surface p-4 md:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden />
            AIトラップ分析＆選択肢（誤りがあれば修正してください）
          </h2>
          <div className="max-h-[60dvh] space-y-4 overflow-y-auto pr-1">
            {material.questions.map((q, qIdx) => (
              <div key={`${q.questionNumber}-${qIdx}`} className="space-y-3 rounded-md border bg-background p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="rounded bg-accent/15 px-2 py-0.5 font-bold">{q.questionNumber}</span>
                  <span className="font-mono text-muted">対象: {q.targetUnderlineId}</span>
                </div>
                <input
                  aria-label={`${q.questionNumber} 設問文`}
                  value={q.questionText}
                  onChange={(e) => setQuestion(qIdx, { questionText: e.target.value })}
                  className={`${inputClass} font-medium`}
                />
                {q.choices.map((c, cIdx) => (
                  <div
                    key={`${c.id}-${cIdx}`}
                    className={`space-y-2 rounded-md border p-3 ${
                      c.isCorrect ? 'border-emerald-500/40 bg-emerald-500/5' : 'bg-surface'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold">
                        選択肢 [{c.id}]{' '}
                        {c.isCorrect && <span className="ml-1 text-emerald-400">★ 正解</span>}
                      </span>
                      <select
                        aria-label={`${q.questionNumber} 選択肢${c.id} のトラップ分類`}
                        value={c.trapType}
                        onChange={(e) => {
                          const trapType = e.target.value as TrapType;
                          setChoice(qIdx, cIdx, { trapType, isCorrect: trapType === 'none' });
                        }}
                        className="min-h-9 rounded-md border bg-background px-2 text-xs font-semibold"
                      >
                        {Object.entries(TRAP_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      aria-label={`${q.questionNumber} 選択肢${c.id} 本文`}
                      value={c.text}
                      onChange={(e) => setChoice(qIdx, cIdx, { text: e.target.value })}
                      className={`${inputClass} text-xs`}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            この内容で確定し、消去法演習を開始する
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
          {!canStart && (
            <p className="text-xs text-muted">
              演習を始めるには、本文・設問が1つ以上あり、各設問の正解がちょうど1つである必要があります。
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
