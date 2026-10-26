'use client';

import { useEffect, useRef } from 'react';

export interface PracticeShortcutHandlers {
  /** 1〜4: 選択肢へフォーカス */
  onFocusChoice: (label: number) => void;
  /** X / Backspace */
  onToggleEliminate: () => void;
  /** T */
  onToggleTrapPicker: () => void;
  /** トラップピッカー表示中の 1〜6 */
  onPickTrap: (keyNumber: number) => void;
  /** トラップピッカー表示中の 0: タグ解除 */
  onClearTrap: () => void;
  /** Escape（ピッカーを閉じる） */
  onEscape: () => void;
  /** C */
  onSelectCandidate: () => void;
  /** Space / Enter */
  onConfirm: () => void;
  /** N */
  onNext: () => void;
  /** V */
  onToggleWritingMode: () => void;
  /** M */
  onToggleMarkers: () => void;
}

export interface PracticeShortcutOptions {
  enabled?: boolean;
  /** 選択肢の最大番号（既定 4） */
  choiceCount?: number;
  trapPickerOpen: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * 演習画面のキーボードショートカット。
 * textarea / input にフォーカスがあるとき、および修飾キー併用時は何もしない。
 */
export function usePracticeShortcuts(handlers: PracticeShortcutHandlers, options: PracticeShortcutOptions): void {
  const handlersRef = useRef(handlers);
  const optionsRef = useRef(options);
  useEffect(() => {
    handlersRef.current = handlers;
    optionsRef.current = options;
  });

  useEffect(() => {
    let swallowSpaceKeyUp = false;

    function onKeyDown(e: KeyboardEvent) {
      const opts = optionsRef.current;
      if (opts.enabled === false) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (isTypingTarget(e.target)) return;

      const h = handlersRef.current;
      const key = e.key;
      const choiceCount = opts.choiceCount ?? 4;
      const handled = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      if (key === 'Escape') {
        if (opts.trapPickerOpen) handled(h.onEscape);
        return;
      }

      // トラップピッカー表示中は数字キーをトラップ指定に割り当てる
      if (opts.trapPickerOpen && /^[0-6]$/.test(key)) {
        handled(() => (key === '0' ? h.onClearTrap() : h.onPickTrap(Number(key))));
        return;
      }

      if (/^[1-9]$/.test(key)) {
        const n = Number(key);
        if (n <= choiceCount) handled(() => h.onFocusChoice(n));
        return;
      }

      switch (key.toLowerCase()) {
        case 'x':
        case 'backspace':
          return handled(h.onToggleEliminate);
        case 't':
          return handled(h.onToggleTrapPicker);
        case 'c':
          return handled(h.onSelectCandidate);
        case 'n':
          return handled(h.onNext);
        case 'v':
          return handled(h.onToggleWritingMode);
        case 'm':
          return handled(h.onToggleMarkers);
        case 'enter':
          return handled(h.onConfirm);
        case ' ':
          swallowSpaceKeyUp = true;
          return handled(h.onConfirm);
        default:
      }
    }

    // フォーカス中のボタンが Space の keyup で click 扱いになるのを防ぐ
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ' && swallowSpaceKeyUp) {
        swallowSpaceKeyUp = false;
        e.preventDefault();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
