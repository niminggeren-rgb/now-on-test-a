'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { FastForward, Sparkles, Volume2 } from 'lucide-react';
import { cinematicSound } from '@/lib/sound/cinematic';

const SPLASH_STORAGE_KEY = 'lv_cinematic_splash_date';
const ZOOM_AT_MS = 2600;
const END_AT_MS = 3400;

/** ローカル日付 (YYYY-MM-DD)。UTC だと日本時間の朝9時前に日付が切り替わってしまうため使わない。 */
export function getTodayKey(date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function readLastShown(): string | null {
  try {
    return window.localStorage.getItem(SPLASH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastShown(value: string): void {
  try {
    window.localStorage.setItem(SPLASH_STORAGE_KEY, value);
  } catch {
    // プライベートモード等では保存できないが、演出自体は支障なく終了させる
  }
}

interface CinematicSplashProps {
  /** true の場合は 1日1回の制限を無視して表示する（デモ再生用） */
  forceShow?: boolean;
  onComplete?: () => void;
}

export function CinematicSplash({ forceShow = false, onComplete }: CinematicSplashProps) {
  const reduceMotion = useReducedMotion();
  const [shouldRender, setShouldRender] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [phase, setPhase] = useState<'waiting' | 'playing' | 'zoomOut'>('waiting');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => {
    if (forceShow) {
      setShouldRender(true);
      return;
    }
    if (reduceMotion) {
      onCompleteRef.current?.();
      return;
    }
    if (readLastShown() !== getTodayKey()) {
      setShouldRender(true);
    } else {
      onCompleteRef.current?.();
    }
  }, [forceShow, reduceMotion]);

  useEffect(() => clearTimers, [clearTimers]);

  const finishSplash = useCallback(() => {
    clearTimers();
    cinematicSound.fadeOutAndStop();
    writeLastShown(getTodayKey());
    setShouldRender(false);
    onCompleteRef.current?.();
  }, [clearTimers]);

  // AudioContext は必ずユーザー操作（クリック）の中で生成・再生する
  const startSequence = useCallback(() => {
    if (hasStarted) return;
    setHasStarted(true);
    setPhase('playing');
    cinematicSound.playCinematicStrike();
    timers.current.push(setTimeout(() => setPhase('zoomOut'), ZOOM_AT_MS));
    timers.current.push(setTimeout(finishSplash, END_AT_MS));
  }, [hasStarted, finishSplash]);

  useEffect(() => {
    if (!shouldRender) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finishSplash();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shouldRender, finishSplash]);

  return (
    <AnimatePresence>
      {shouldRender && (
        <motion.div
          key="cinematic-splash-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="起動演出"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeInOut' } }}
          onClick={hasStarted ? finishSplash : startSequence}
          className="fixed inset-0 z-[9999] flex cursor-pointer select-none flex-col items-center justify-center overflow-hidden bg-black text-white"
        >
          {/* 背景のアンビエント光彩 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={
              phase === 'playing'
                ? { opacity: [0, 0.65, 0.35], scale: [0.6, 1.35, 1.6] }
                : phase === 'zoomOut'
                  ? { opacity: 0, scale: 3.0 }
                  : { opacity: 0.15, scale: 0.9 }
            }
            transition={{ duration: 2.6, ease: 'easeOut' }}
            className="pointer-events-none absolute h-[420px] w-[420px] rounded-full bg-gradient-to-tr from-trap-overstatement/40 via-trap-overstatement/25 to-accent/30 blur-[110px]"
          />

          {/* 水平レーザーフレア */}
          {hasStarted && (
            <motion.div
              initial={{ width: '0%', opacity: 0 }}
              animate={
                phase === 'playing'
                  ? { width: ['0%', '85%', '60%'], opacity: [0, 1, 0.3] }
                  : { width: '120%', opacity: 0 }
              }
              transition={{ duration: 1.8, ease: 'circOut', delay: 0.25 }}
              className="pointer-events-none absolute h-[2px] bg-gradient-to-r from-transparent via-trap-overstatement to-transparent shadow-[0_0_25px_hsl(var(--trap-overstatement))]"
            />
          )}

          {!hasStarted ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative z-10 flex flex-col items-center gap-6 px-6 text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-trap-overstatement/40 bg-trap-overstatement/10">
                <Sparkles className="h-8 w-8 animate-pulse text-trap-overstatement" aria-hidden />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-trap-overstatement">
                  Logical Vernacular Exam OS
                </p>
                <h2 className="text-2xl font-extrabold tracking-wider text-zinc-100 md:text-3xl">
                  論理読解エンジンを起動
                </h2>
              </div>
              <motion.button
                type="button"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={(e) => {
                  e.stopPropagation();
                  startSequence();
                }}
                autoFocus
                className="group flex min-h-11 items-center gap-3 rounded-full border border-trap-overstatement/60 bg-gradient-to-r from-trap-overstatement to-trap-partial px-8 py-3.5 font-mono text-sm font-bold tracking-widest text-white"
              >
                <Volume2 className="h-4 w-4 transition-transform group-hover:scale-110" aria-hidden />
                <span>TAP TO LAUNCH</span>
              </motion.button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  finishSplash();
                }}
                className="mt-2 min-h-11 px-4 text-xs text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
              >
                サウンドなしでスキップ
              </button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0.72, opacity: 0, filter: 'blur(12px)' }}
              animate={
                phase === 'playing'
                  ? {
                      scale: [0.72, 1.0, 1.08],
                      opacity: [0, 1, 1],
                      filter: ['blur(12px)', 'blur(0px)', 'blur(0px)'],
                    }
                  : { scale: 14, opacity: 0, filter: 'blur(8px)' }
              }
              transition={
                phase === 'playing'
                  ? { duration: 2.5, times: [0, 0.35, 1], ease: [0.16, 1, 0.3, 1] }
                  : { duration: 0.75, ease: 'easeIn' }
              }
              className="relative z-10 flex flex-col items-center px-4 text-center"
            >
              <motion.span
                initial={{ opacity: 0, letterSpacing: '0.1em' }}
                animate={{ opacity: 1, letterSpacing: '0.45em' }}
                transition={{ duration: 1.8, delay: 0.25, ease: 'easeOut' }}
                className="mb-3 text-xs font-bold uppercase text-trap-overstatement md:text-sm"
              >
                LOGICAL VERNACULAR
              </motion.span>
              <h2 className="bg-gradient-to-b from-white via-zinc-100 to-zinc-400 bg-clip-text text-5xl font-black tracking-tighter text-transparent drop-shadow-[0_0_35px_hsl(var(--trap-overstatement)/0.65)] sm:text-7xl md:text-8xl">
                受験<span className="text-trap-overstatement">OS</span>
              </h2>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 0.85, y: 0 }}
                transition={{ duration: 1.0, delay: 0.75 }}
                className="mt-5 text-xs font-medium tracking-[0.25em] text-zinc-400 sm:text-sm"
              >
                センスを排し、論理のアルゴリズムで現代文を制圧する
              </motion.p>
            </motion.div>
          )}

          {hasStarted && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ delay: 0.5 }}
              className="absolute bottom-8 right-8 flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-2 text-xs font-medium text-zinc-400 backdrop-blur-md"
            >
              <span>画面タップでスキップ</span>
              <FastForward className="h-3.5 w-3.5" aria-hidden />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
