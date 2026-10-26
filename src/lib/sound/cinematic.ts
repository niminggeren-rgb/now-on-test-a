/**
 * Web Audio API を用いた純コード実装のシネマティック・サウンドエンジン。
 * 外部アセット不要で、重低音ストライク＆倍音レゾナンスをリアルタイム合成する。
 */
class CinematicSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isPlaying = false;

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {
        // 自動再生ポリシーによりブロックされた場合は静かに無視
      });
    }
    return this.ctx;
  }

  /** 「ドゥーーン（Ta-dum / Deep Braaam）」を合成・再生する */
  public playCinematicStrike(): void {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    this.isPlaying = true;

    // マスターゲイン + コンプレッサー（音割れ防止と重厚感）
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, now);
    compressor.knee.setValueAtTime(12, now);
    compressor.ratio.setValueAtTime(8, now);
    compressor.attack.setValueAtTime(0.005, now);
    compressor.release.setValueAtTime(0.25, now);
    compressor.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.85, now);
    master.connect(compressor);
    this.masterGain = master;

    // 空間残響用ステレオディレイ（疑似リバーブ）
    const delayL = ctx.createDelay(2.0);
    const delayR = ctx.createDelay(2.0);
    const feedback = ctx.createGain();
    const delayFilter = ctx.createBiquadFilter();

    delayL.delayTime.setValueAtTime(0.11, now);
    delayR.delayTime.setValueAtTime(0.17, now);
    feedback.gain.setValueAtTime(0.45, now);
    delayFilter.type = 'lowpass';
    delayFilter.frequency.setValueAtTime(1200, now);

    delayL.connect(delayR);
    delayR.connect(delayFilter);
    delayFilter.connect(feedback);
    feedback.connect(delayL);
    delayFilter.connect(master);

    // 1. 第1撃 (0.0s): メタリック・アンビル・アタック
    this.triggerImpactPunch(ctx, master, now, 110, 38, 0.7);

    // 2. 第2撃 (0.28s): サブベース・ドロップ & 重低音
    const strikeTime = now + 0.28;
    this.triggerImpactPunch(ctx, master, strikeTime, 95, 27.5, 1.0);

    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(65, strikeTime);
    subOsc.frequency.exponentialRampToValueAtTime(32.7, strikeTime + 0.35);
    subOsc.frequency.exponentialRampToValueAtTime(27.5, strikeTime + 2.8);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.setValueAtTime(0.9, strikeTime);
    subGain.gain.exponentialRampToValueAtTime(0.65, strikeTime + 0.8);
    subGain.gain.exponentialRampToValueAtTime(0.0001, strikeTime + 3.4);

    subOsc.connect(subGain);
    subGain.connect(master);
    subOsc.start(strikeTime);
    subOsc.stop(strikeTime + 3.5);

    // 3. シネマティック・ブラス/シンセコード共鳴（D9 / Asus2 系の重厚で知的な響き）
    const chordFrequencies = [55.0, 82.41, 110.0, 164.81, 220.0, 246.94, 329.63];

    chordFrequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const detuneOsc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const voiceGain = ctx.createGain();

      osc.type = idx < 4 ? 'sawtooth' : 'triangle';
      detuneOsc.type = 'sawtooth';

      osc.frequency.setValueAtTime(freq * 0.99, strikeTime);
      osc.frequency.exponentialRampToValueAtTime(freq, strikeTime + 0.15);

      detuneOsc.frequency.setValueAtTime(freq, strikeTime);
      // わずかなデチューンで壮大なコーラス感を生成
      detuneOsc.detune.setValueAtTime((idx % 2 === 0 ? 1 : -1) * (6 + idx * 1.5), strikeTime);

      // ローパスのカットオフが開いて閉じる（ブラス効果）
      filter.type = 'lowpass';
      filter.Q.setValueAtTime(2.5, strikeTime);
      filter.frequency.setValueAtTime(120, strikeTime);
      filter.frequency.exponentialRampToValueAtTime(1800 - idx * 150, strikeTime + 0.45);
      filter.frequency.exponentialRampToValueAtTime(180, strikeTime + 3.2);

      const level = idx < 2 ? 0.22 : 0.12;
      voiceGain.gain.setValueAtTime(0.0001, strikeTime);
      voiceGain.gain.linearRampToValueAtTime(level, strikeTime + 0.08);
      voiceGain.gain.exponentialRampToValueAtTime(level * 0.7, strikeTime + 1.1);
      voiceGain.gain.exponentialRampToValueAtTime(0.0001, strikeTime + 3.3);

      osc.connect(filter);
      detuneOsc.connect(filter);
      filter.connect(voiceGain);

      voiceGain.connect(master);
      voiceGain.connect(delayL);

      osc.start(strikeTime);
      detuneOsc.start(strikeTime);
      osc.stop(strikeTime + 3.4);
      detuneOsc.stop(strikeTime + 3.4);
    });

    // 4. クリスタル・シマー（高域のきらめき）
    const shimmerTime = strikeTime + 0.15;
    [880, 1108.73, 1318.51].forEach((freq) => {
      const shimmerOsc = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmerOsc.type = 'sine';
      shimmerOsc.frequency.setValueAtTime(freq, shimmerTime);

      shimmerGain.gain.setValueAtTime(0.0001, shimmerTime);
      shimmerGain.gain.linearRampToValueAtTime(0.035, shimmerTime + 0.3);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, shimmerTime + 2.6);

      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(delayL);
      shimmerOsc.start(shimmerTime);
      shimmerOsc.stop(shimmerTime + 2.7);
    });
  }

  /** 打撃アタック音（ピッチエンベロープ付きローエンドパンチ） */
  private triggerImpactPunch(
    ctx: AudioContext,
    destination: AudioNode,
    startTime: number,
    startFreq: number,
    endFreq: number,
    intensity: number,
  ): void {
    const punchOsc = ctx.createOscillator();
    const punchGain = ctx.createGain();

    punchOsc.type = 'triangle';
    punchOsc.frequency.setValueAtTime(startFreq, startTime);
    punchOsc.frequency.exponentialRampToValueAtTime(endFreq, startTime + 0.18);

    punchGain.gain.setValueAtTime(0.001, startTime);
    punchGain.gain.linearRampToValueAtTime(0.8 * intensity, startTime + 0.012);
    punchGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);

    punchOsc.connect(punchGain);
    punchGain.connect(destination);

    punchOsc.start(startTime);
    punchOsc.stop(startTime + 0.5);
  }

  /** スキップ時に音を自然にフェードアウトさせる */
  public fadeOutAndStop(): void {
    if (!this.ctx || !this.masterGain || !this.isPlaying) return;
    try {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      this.isPlaying = false;
    } catch {
      // コンテキスト破棄済みの場合は無視
    }
  }
}

export const cinematicSound = new CinematicSoundEngine();
