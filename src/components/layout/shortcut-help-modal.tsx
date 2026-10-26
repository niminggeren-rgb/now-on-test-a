'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: '1 – 5', label: '選択肢にフォーカス' },
  { keys: 'X / Backspace', label: '選択肢を消去（スラッシュ）' },
  { keys: 'T', label: 'トラップ種別を指定（1〜6で確定）' },
  { keys: 'C', label: '解答候補にする' },
  { keys: 'Space / Enter', label: '解答を確定' },
  { keys: 'N', label: '次の問題へ' },
  { keys: 'V', label: '縦書き / 横書き切替' },
  { keys: 'M', label: '論理接続詞マーカー切替' },
  { keys: '?', label: 'このヘルプを開閉' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function ShortcutHelpModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === '?' && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="キーボードショートカット"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-md rounded-lg border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">キーボードショートカット</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="閉じる"
            className="rounded p-1 text-muted hover:bg-foreground/5 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-muted">{s.label}</dt>
              <dd>
                <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs">{s.keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
