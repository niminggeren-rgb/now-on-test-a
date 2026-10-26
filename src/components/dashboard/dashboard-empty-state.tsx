import Link from 'next/link';
import { ArrowRight, BookOpenCheck, Slash, Tag, CheckCheck } from 'lucide-react';

const STEPS = [
  { icon: Slash, key: 'X', title: '選択肢を消去する', body: '本文と照合して、誤りだと判断した選択肢に斜線を引きます。' },
  { icon: Tag, key: 'T', title: 'トラップの種類を指定する', body: '言い過ぎ・因果逆転など、なぜ誤りかを6種類から選びます。' },
  { icon: CheckCheck, key: 'Space', title: '解答を確定する', body: '答え合わせと同時に、あなたのタグと正解トラップを照合します。' },
];

/** 回答履歴が0件のときの案内。ダミー数値は一切表示しない。 */
export function DashboardEmptyState({ startHref }: { startHref: string }) {
  return (
    <section
      aria-label="演習履歴がありません"
      data-testid="dashboard-empty"
      className="mx-auto flex max-w-2xl flex-col items-center rounded-xl border bg-surface px-6 py-10 text-center md:py-14"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
        <BookOpenCheck className="h-7 w-7 text-accent" aria-hidden />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">演習履歴がありません</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        まずは1問解いてみましょう。解いた記録から、あなたが引っかかりやすいトラップと
        <wbr />
        論理消去の精度をここに分析します。
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href={startHref}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          最初の1問を解く
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link href="/practice" className="inline-flex items-center rounded-md border px-5 py-2.5 text-sm hover:bg-foreground/5">
          問題一覧を見る
        </Link>
      </div>

      <ol className="mt-10 grid w-full gap-3 text-left sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-lg border bg-background/60 p-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <s.icon className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono">STEP {i + 1}</span>
              <kbd className="ml-auto hidden rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] mouse:inline">
                {s.key}
              </kbd>
            </div>
            <h3 className="mt-1.5 text-xs font-semibold">{s.title}</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
