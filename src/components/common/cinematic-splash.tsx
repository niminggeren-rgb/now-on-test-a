'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cinematicSound } from '@/lib/sound/cinematic';

const SPLASH_STORAGE_KEY = 'lv_cinematic_splash_date';
const ZOOM_AT_MS = 2300;
const END_AT_MS = 3000;

/** 光の筋の本数。位置・角度・遅延は添字から決めるので描画ごとに値が変わらない。 */
const RIBBONS = Array.from({ length: 21 }, (_, i) => {
  const t = (i - 10) / 10; // -1 〜 1
  return {
    id: i,
    spread: t * 62, // vw: 中心から左右へ広がる到達位置
    tilt: t * 14, // deg: 扇状に傾ける
    width: 2 + ((i * 7) % 5) * 3, // px
    delay: Math.abs(t) * 0.35 + (i % 3) * 0.04,
    strength: 0.8 + ((i * 5) % 4) * 0.07,
  };
});

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

/**
 * 起動演出。純黒の画面にロゴとタグラインだけを置き、画面のどこをタップしても
 * サウンドと光の筋が奥から手前へ弾けてダッシュボードへ遷移する。
 */
export function CinematicSplash({ forceShow = false, onComplete }: CinematicSplashProps) {
  const reduceMotion = useReducedMotion();
  const [shouldRender, setShouldRender] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'burst' | 'zoomOut'>('idle');
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

  // AudioContext は必ずユーザー操作（タップ）の中で生成・再生する
  const handleTap = useCallback(() => {
    if (phase !== 'idle') {
      finishSplash();
      return;
    }
    setPhase('burst');
    cinematicSound.playCinematicStrike();
    timers.current.push(setTimeout(() => setPhase('zoomOut'), ZOOM_AT_MS));
    timers.current.push(setTimeout(finishSplash, END_AT_MS));
  }, [phase, finishSplash]);

  useEffect(() => {
    if (!shouldRender) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finishSplash();
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shouldRender, finishSplash, handleTap]);

  const bursting = phase !== 'idle';

  return (
    <AnimatePresence>
      {shouldRender && (
        <motion.div
          key="cinematic-splash-backdrop"
          role="button"
          tabIndex={0}
          aria-label="国語読解、成績向上。 画面をタップして開始"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
          onClick={handleTap}
          className="fixed inset-0 z-[9999] flex cursor-pointer select-none items-center justify-center overflow-hidden bg-black text-white outline-none"
          style={{ perspective: 900 }}
        >
          {/* 奥から手前へ弾ける光の筋 */}
          {bursting &&
            RIBBONS.map((r) => (
              <motion.span
                key={r.id}
                aria-hidden
                initial={{ x: 0, scaleX: 0.2, scaleY: 0.05, opacity: 0, rotate: 0, z: -600 }}
                animate={{
                  x: [`0vw`, `${r.spread}vw`, `${r.spread * 1.7}vw`],
                  scaleX: [0.2, 1, 2.4],
                  scaleY: [0.05, 1, 1.4],
                  opacity: [0, r.strength, 0],
                  rotate: [0, r.tilt, r.tilt * 1.4],
                  z: [-600, 0, 380],
                }}
                transition={{ duration: 2.1, delay: r.delay, times: [0, 0.45, 1], ease: [0.22, 1, 0.36, 1] }}
                className="pointer-events-none absolute top-1/2 left-1/2 h-[150vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-b from-transparent via-brand to-transparent blur-[2px]"
                style={{ width: r.width }}
              />
            ))}

          {/* 奥の光彩 */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.3 }}
            animate={
              phase === 'idle'
                ? { opacity: 0, scale: 0.3 }
                : phase === 'burst'
                  ? { opacity: [0, 0.9, 0.5], scale: [0.3, 1.5, 2.2] }
                  : { opacity: 0, scale: 4 }
            }
            transition={{ duration: phase === 'zoomOut' ? 0.7 : 1.8, ease: 'easeOut' }}
            className="pointer-events-none absolute h-[60vmin] w-[60vmin] rounded-full bg-brand/60 blur-[120px]"
          />

          {/* ロゴ + タグライン */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={
              phase === 'idle'
                ? { opacity: [0.55, 1, 0.55], scale: 1 }
                : phase === 'burst'
                  ? { opacity: 1, scale: [1, 1.06] }
                  : { opacity: 0, scale: 16, filter: 'blur(10px)' }
            }
            transition={
              phase === 'idle'
                ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' }
                : phase === 'burst'
                  ? { duration: 2.3, ease: [0.16, 1, 0.3, 1] }
                  : { duration: 0.7, ease: 'easeIn' }
            }
            className="relative z-10 flex flex-col items-center px-6 text-center"
          >
            <h1
              className="text-6xl font-black leading-none tracking-tight text-brand sm:text-8xl md:text-9xl"
              style={{ textShadow: bursting ? '0 0 60px hsl(var(--brand-red) / 0.8)' : '0 0 24px hsl(var(--brand-red) / 0.35)' }}
            >
              受験OS
            </h1>
            <p className="mt-6 text-sm font-medium tracking-[0.5em] text-zinc-300 sm:text-base md:text-lg">
              国語読解、成績向上。
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
