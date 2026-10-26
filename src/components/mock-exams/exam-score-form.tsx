'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus } from 'lucide-react';
import { mockExamInputSchema, type MockExamFormValues } from '@/lib/schemas';
import type { MockExamRecord } from '@/types/domain';
import type { Repository } from '@/lib/repository';
import { cn } from '@/lib/utils';

const PROVIDERS = ['河合塾', '駿台', '東進', '代ゼミ', '学校定期考査'];

const inputCls =
  'w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent aria-[invalid=true]:border-rose-500';

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
      <span role="alert" className="mt-1 block min-h-4 text-rose-400">
        {error}
      </span>
    </label>
  );
}

export function ExamScoreForm({ repo, onAdded }: { repo: Repository; onAdded: (record: MockExamRecord) => void }) {
  const [submitError, setSubmitError] = useState('');
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MockExamFormValues>({
    resolver: zodResolver(mockExamInputSchema),
    defaultValues: { modernJapaneseMaxScore: 100, selfReflection: '' },
  });

  async function onSubmit(values: MockExamFormValues) {
    setSubmitError('');
    const res = await repo.addMockExam(values);
    if (!res.success) {
      setSubmitError(res.error);
      for (const [key, messages] of Object.entries(res.fieldErrors ?? {})) {
        setError(key as keyof MockExamFormValues, { message: messages[0] });
      }
      return;
    }
    onAdded(res.data);
    reset({ modernJapaneseMaxScore: 100, selfReflection: '' });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="模試スコア登録" className="space-y-1">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="主催" error={errors.examProvider?.message}>
          <input list="exam-providers" className={inputCls} aria-invalid={!!errors.examProvider} {...register('examProvider')} />
          <datalist id="exam-providers">
            {PROVIDERS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="模試名" error={errors.examName?.message}>
          <input className={inputCls} placeholder="第4回 全統記述模試" aria-invalid={!!errors.examName} {...register('examName')} />
        </Field>
        <Field label="実施日" error={errors.examDate?.message}>
          <input type="date" className={inputCls} aria-invalid={!!errors.examDate} {...register('examDate')} />
        </Field>
        <Field label="偏差値" error={errors.deviationValue?.message}>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            className={cn(inputCls, 'font-mono')}
            aria-invalid={!!errors.deviationValue}
            {...register('deviationValue', { valueAsNumber: true })}
          />
        </Field>
        <Field label="現代文 素点" error={errors.modernJapaneseScore?.message}>
          <input
            type="number"
            inputMode="decimal"
            className={cn(inputCls, 'font-mono')}
            aria-invalid={!!errors.modernJapaneseScore}
            {...register('modernJapaneseScore', { valueAsNumber: true })}
          />
        </Field>
        <Field label="満点" error={errors.modernJapaneseMaxScore?.message}>
          <input
            type="number"
            inputMode="decimal"
            className={cn(inputCls, 'font-mono')}
            aria-invalid={!!errors.modernJapaneseMaxScore}
            {...register('modernJapaneseMaxScore', { valueAsNumber: true })}
          />
        </Field>
      </div>
      <Field label="自己分析メモ" error={errors.selfReflection?.message}>
        <textarea rows={3} className={inputCls} placeholder="失点の原因、気づいたこと" {...register('selfReflection')} />
      </Field>
      {submitError && (
        <p role="alert" className="text-xs text-rose-400">
          {submitError}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        成績を登録
      </button>
    </form>
  );
}
