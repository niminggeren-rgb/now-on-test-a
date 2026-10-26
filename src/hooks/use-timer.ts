'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const TICK_MS = 100;

/** 02:14.5 形式（分:秒.十分の一秒）。 */
export function formatElapsed(ms: number): string {
  const tenths = Math.floor(ms / 100) % 10;
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

export interface UseTimer {
  elapsedMs: number;
  formatted: string;
  running: boolean;
  pause: () => void;
  resume: () => void;
  /** 経過時間を initialMs に戻して再開する。 */
  reset: (initialMs?: number) => void;
  /** 現在の経過時間（state の再描画を待たず取得）。 */
  getElapsedMs: () => number;
}

export function useTimer(autoStart = true): UseTimer {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(autoStart);
  // 壁時計ベースで計測し、タブ非アクティブ時のタイマー間引きによるずれを避ける
  const baseRef = useRef(0);
  const startedAtRef = useRef<number | null>(autoStart ? Date.now() : null);

  const current = useCallback((): number => {
    const startedAt = startedAtRef.current;
    return baseRef.current + (startedAt === null ? 0 : Date.now() - startedAt);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsedMs(current()), TICK_MS);
    return () => window.clearInterval(id);
  }, [running, current]);

  const pause = useCallback(() => {
    if (startedAtRef.current === null) return;
    baseRef.current = current();
    startedAtRef.current = null;
    setElapsedMs(baseRef.current);
    setRunning(false);
  }, [current]);

  const resume = useCallback(() => {
    if (startedAtRef.current !== null) return;
    startedAtRef.current = Date.now();
    setRunning(true);
  }, []);

  const reset = useCallback((initialMs = 0) => {
    baseRef.current = initialMs;
    startedAtRef.current = Date.now();
    setElapsedMs(initialMs);
    setRunning(true);
  }, []);

  return { elapsedMs, formatted: formatElapsed(elapsedMs), running, pause, resume, reset, getElapsedMs: current };
}
