'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { type StoredCustomMaterial } from '@/lib/repositories/customMaterialRepository';
import { customPassageCloud } from '@/lib/repositories/customPassageCloud';
import { TARGET_LEVEL_LABELS } from '@/types/ai-pipeline';
import { MaterialPractice } from './material-practice';

/** 保存済みのマイ教材（端末 → Supabase の順に探す）を消去法演習で解く */
export function CustomMaterialPlayer({ materialId }: { materialId: string }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'missing' } | { status: 'ready'; material: StoredCustomMaterial }>({
    status: 'loading',
  });

  useEffect(() => {
    let cancelled = false;
    void customPassageCloud.resolve(materialId).then((material) => {
      if (!cancelled) setState(material ? { status: 'ready', material } : { status: 'missing' });
    });
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/import" className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          教材インジェクターへ戻る
        </Link>
        {state.status === 'ready' && state.material.targetLevel && (
          <span className="rounded-full border px-3 py-1 text-[11px] font-semibold text-muted">
            {TARGET_LEVEL_LABELS[state.material.targetLevel]}レベル
          </span>
        )}
      </div>

      {state.status === 'loading' && (
        <div className="h-96 animate-pulse rounded-lg border bg-surface" aria-busy="true" aria-label="読み込み中" />
      )}
      {state.status === 'missing' && (
        <p className="mx-auto max-w-md rounded-lg border bg-surface p-8 text-center text-sm text-muted">
          この教材が見つかりません。別の端末で作成した教材は、同じアカウントでログインすると表示されます。
        </p>
      )}
      {state.status === 'ready' && <MaterialPractice material={state.material} />}
    </div>
  );
}
