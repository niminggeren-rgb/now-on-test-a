'use client';

import { useEffect, useState } from 'react';
import { CinematicSplash } from './cinematic-splash';

/** ヘッダーの「起動演出を再生」ボタンが発火するイベント名 */
export const PLAY_SPLASH_EVENT = 'lv:play-splash';

/**
 * ダッシュボードレイアウトに常駐するスプラッシュの管理役。
 * 初回（1日1回）は自動表示し、PLAY_SPLASH_EVENT を受けたら forceShow で再生し直す。
 */
export function SplashHost() {
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const onPlay = () => setReplay((n) => n + 1);
    window.addEventListener(PLAY_SPLASH_EVENT, onPlay);
    return () => window.removeEventListener(PLAY_SPLASH_EVENT, onPlay);
  }, []);

  return <CinematicSplash key={replay} forceShow={replay > 0} />;
}
