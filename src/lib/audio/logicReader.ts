import type { LogicalMarkerCategory, LogicalMarkerToken } from '@/types/protocol';

export const LOGICAL_PAUSE_MS = 400;

export interface SpeechChunk {
  id: string;
  paragraphIndex: number;
  sentenceIndex: number;
  text: string;
  isLogicalMarker: boolean;
  markerCategory?: LogicalMarkerCategory;
  prePauseMs: number;
  postPauseMs: number;
  /** 基準ピッチ・速度に対する倍率 */
  pitch: number;
  rate: number;
  charStartInParagraph: number;
  charEndInParagraph: number;
}

export interface LogicReaderCallbacks {
  onStateChange?: (state: ReaderState) => void;
  onChunkStart?: (chunk: SpeechChunk) => void;
  onMarkerEmphasis?: (chunk: SpeechChunk) => void;
  onParagraphChange?: (paragraphIndex: number) => void;
  onProgress?: (currentChunkIndex: number, totalChunks: number) => void;
  onComplete?: () => void;
  onError?: (message: string) => void;
}

export type ReaderState = 'idle' | 'playing' | 'paused';

const marker = (
  surface: string,
  category: LogicalMarkerCategory,
  step: 'STEP_1' | 'STEP_3',
  pitchMultiplier: number,
  rateMultiplier: number,
): LogicalMarkerToken => ({ surface, category, protocolStepRelevance: step, pauseDurationMs: LOGICAL_PAUSE_MS, pitchMultiplier, rateMultiplier });

/** 論理マーカー辞書。直前に 400ms の沈黙を置き、マーカー自体はピッチを上げてゆっくり読む。 */
export const LOGICAL_MARKERS: readonly LogicalMarkerToken[] = [
  marker('しかしながら', 'adversative', 'STEP_3', 1.18, 0.88),
  marker('それにもかかわらず', 'adversative', 'STEP_3', 1.16, 0.88),
  marker('にもかかわらず', 'adversative', 'STEP_3', 1.16, 0.88),
  marker('しかし', 'adversative', 'STEP_3', 1.18, 0.88),
  marker('ところが', 'adversative', 'STEP_3', 1.15, 0.9),
  marker('けれども', 'adversative', 'STEP_3', 1.14, 0.9),
  marker('だが', 'adversative', 'STEP_3', 1.16, 0.88),
  marker('言い換えれば', 'paraphrase', 'STEP_3', 1.14, 0.86),
  marker('すなわち', 'paraphrase', 'STEP_3', 1.14, 0.86),
  marker('要するに', 'paraphrase', 'STEP_3', 1.15, 0.86),
  marker('つまり', 'paraphrase', 'STEP_3', 1.15, 0.86),
  marker('したがって', 'causal', 'STEP_3', 1.12, 0.88),
  marker('なぜならば', 'causal', 'STEP_3', 1.14, 0.88),
  marker('なぜなら', 'causal', 'STEP_3', 1.14, 0.88),
  marker('というのは', 'causal', 'STEP_3', 1.12, 0.9),
  marker('それゆえに', 'causal', 'STEP_3', 1.12, 0.88),
  marker('それゆえ', 'causal', 'STEP_3', 1.12, 0.88),
  marker('だから', 'causal', 'STEP_3', 1.12, 0.9),
  marker('これに対して', 'contrast', 'STEP_1', 1.16, 0.88),
  marker('その一方で', 'contrast', 'STEP_1', 1.15, 0.88),
  marker('他方で', 'contrast', 'STEP_1', 1.15, 0.88),
  marker('一方で', 'contrast', 'STEP_1', 1.14, 0.9),
  marker('反対に', 'contrast', 'STEP_1', 1.14, 0.9),
  marker('ただし', 'restriction', 'STEP_3', 1.13, 0.9),
  marker('もっとも', 'restriction', 'STEP_3', 1.1, 0.92),
];

const SORTED_MARKERS = [...LOGICAL_MARKERS].sort((a, b) => b.surface.length - a.surface.length);

/**
 * 文頭、または読点・空白の直後に現れる論理マーカーを1つ探す（最長一致）。
 * 文中の「〜だから」のような語尾は対象にしない。
 */
export function findLeadingMarker(sentence: string): { marker: LogicalMarkerToken; start: number; end: number } | null {
  let best: { marker: LogicalMarkerToken; start: number; end: number } | null = null;
  for (const m of SORTED_MARKERS) {
    let from = 0;
    for (;;) {
      const idx = sentence.indexOf(m.surface, from);
      if (idx === -1) break;
      const prev = idx === 0 ? '' : sentence[idx - 1];
      if (idx === 0 || prev === '、' || prev === ',' || /\s/.test(prev ?? '')) {
        if (!best || idx < best.start) best = { marker: m, start: idx, end: idx + m.surface.length };
        break;
      }
      from = idx + 1;
    }
  }
  return best;
}

/** 段落配列を、論理マーカー直前に 400ms のポーズを持つ読み上げ単位へ変換する（ブラウザ API を使わない純関数） */
export function compileSpeechChunks(paragraphs: readonly string[]): SpeechChunk[] {
  const chunks: SpeechChunk[] = [];
  let counter = 0;
  const nextId = () => `chunk-${counter++}`;

  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!paragraph.trim()) return;
    const sentenceRegex = /[^。！？\n]+[。！？]?/g;
    let sentenceIndex = 0;
    for (let m = sentenceRegex.exec(paragraph); m !== null; m = sentenceRegex.exec(paragraph)) {
      const sentence = m[0];
      if (!sentence.trim()) continue;
      const base = m.index;
      const found = findLeadingMarker(sentence);

      if (!found) {
        chunks.push({
          id: nextId(),
          paragraphIndex,
          sentenceIndex,
          text: sentence.trim(),
          isLogicalMarker: false,
          prePauseMs: sentenceIndex === 0 ? 300 : 100,
          postPauseMs: 150,
          pitch: 1,
          rate: 1,
          charStartInParagraph: base,
          charEndInParagraph: base + sentence.length,
        });
      } else {
        const before = sentence.slice(0, found.start).trim();
        const markerText = sentence.slice(found.start, found.end);
        const after = sentence.slice(found.end).trim();
        if (before) {
          chunks.push({
            id: nextId(),
            paragraphIndex,
            sentenceIndex,
            text: before,
            isLogicalMarker: false,
            prePauseMs: sentenceIndex === 0 ? 250 : 120,
            postPauseMs: 0,
            pitch: 1,
            rate: 1,
            charStartInParagraph: base,
            charEndInParagraph: base + found.start,
          });
        }
        chunks.push({
          id: nextId(),
          paragraphIndex,
          sentenceIndex,
          text: markerText,
          isLogicalMarker: true,
          markerCategory: found.marker.category,
          prePauseMs: found.marker.pauseDurationMs,
          postPauseMs: 180,
          pitch: found.marker.pitchMultiplier,
          rate: found.marker.rateMultiplier,
          charStartInParagraph: base + found.start,
          charEndInParagraph: base + found.end,
        });
        if (after) {
          // マーカー直後は主張・換言の核心なので、少し落ち着いて読む
          chunks.push({
            id: nextId(),
            paragraphIndex,
            sentenceIndex,
            text: after,
            isLogicalMarker: false,
            markerCategory: found.marker.category,
            prePauseMs: 180,
            postPauseMs: 220,
            pitch: 1.04,
            rate: 0.96,
            charStartInParagraph: base + found.end,
            charEndInParagraph: base + sentence.length,
          });
        }
      }
      sentenceIndex++;
    }
  });
  return chunks;
}

/** Web Speech API を使った朗読。論理マーカーの直前で必ず 400ms 止まる。 */
export class ProtocolLogicReader {
  private synth: SpeechSynthesis | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private chunks: SpeechChunk[] = [];
  private index = 0;
  private paragraph = -1;
  private state: ReaderState = 'idle';
  private baseRate = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** ポーズ待ちの最中に一時停止されたか（再開時に発話を始め直す必要がある） */
  private pausedInGap = false;
  /** 発話ごとに増やす世代。止めた後に遅れて届いた onend を無視する */
  private generation = 0;
  private callbacks: LogicReaderCallbacks;

  constructor(callbacks: LogicReaderCallbacks = {}) {
    this.callbacks = callbacks;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.pickVoice();
      this.synth.onvoiceschanged = () => this.pickVoice();
    }
  }

  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  private pickVoice(): void {
    const voices = this.synth?.getVoices() ?? [];
    const ja = voices.filter((v) => v.lang.toLowerCase().startsWith('ja'));
    this.voice =
      ja.find((v) => v.name.includes('Google')) ?? ja.find((v) => /Nanami|Kyoko|Otoya/.test(v.name)) ?? ja[0] ?? null;
  }

  setCallbacks(callbacks: LogicReaderCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setBaseSpeed(rate: number): void {
    this.baseRate = Math.max(0.6, Math.min(2, rate));
  }

  compilePassage(paragraphs: readonly string[]): SpeechChunk[] {
    this.chunks = compileSpeechChunks(paragraphs);
    return this.chunks;
  }

  getState(): ReaderState {
    return this.state;
  }

  getChunks(): readonly SpeechChunk[] {
    return this.chunks;
  }

  play(startChunkIndex?: number): void {
    if (!this.synth) {
      this.callbacks.onError?.('お使いのブラウザは音声読み上げに対応していません。');
      return;
    }
    if (this.state === 'paused' && startChunkIndex === undefined) {
      this.updateState('playing');
      if (this.pausedInGap) {
        this.pausedInGap = false;
        this.speakCurrent();
      } else {
        this.synth.resume();
      }
      return;
    }
    this.halt();
    if (this.chunks.length === 0) {
      this.callbacks.onError?.('読み上げる本文がありません。');
      return;
    }
    this.index = startChunkIndex ?? 0;
    this.paragraph = -1;
    this.updateState('playing');
    this.speakCurrent();
  }

  jumpToParagraph(paragraphIndex: number): void {
    const i = this.chunks.findIndex((c) => c.paragraphIndex === paragraphIndex);
    if (i !== -1) this.play(i);
  }

  pause(): void {
    if (!this.synth || this.state !== 'playing') return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.pausedInGap = true; // 発話はまだ始まっていない
    } else {
      this.synth.pause();
    }
    this.updateState('paused');
  }

  stop(): void {
    this.halt();
    this.index = 0;
    this.paragraph = -1;
    this.updateState('idle');
  }

  private halt(): void {
    this.generation++;
    this.pausedInGap = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.synth?.cancel();
  }

  private speakCurrent(): void {
    const synth = this.synth;
    if (!synth || this.state !== 'playing') return;
    if (this.index >= this.chunks.length) {
      this.updateState('idle');
      this.callbacks.onComplete?.();
      return;
    }
    const chunk = this.chunks[this.index]!;
    if (chunk.paragraphIndex !== this.paragraph) {
      this.paragraph = chunk.paragraphIndex;
      this.callbacks.onParagraphChange?.(chunk.paragraphIndex);
    }
    this.callbacks.onProgress?.(this.index, this.chunks.length);

    const gen = ++this.generation;
    const speak = () => {
      this.timer = null;
      if (gen !== this.generation || this.state !== 'playing') return;
      this.callbacks.onChunkStart?.(chunk);
      if (chunk.isLogicalMarker) this.callbacks.onMarkerEmphasis?.(chunk);

      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.lang = 'ja-JP';
      if (this.voice) utterance.voice = this.voice;
      utterance.pitch = chunk.pitch;
      utterance.rate = chunk.rate * this.baseRate;
      utterance.onend = () => {
        if (gen !== this.generation || this.state !== 'playing') return;
        this.timer = setTimeout(() => {
          this.timer = null;
          this.index++;
          this.speakCurrent();
        }, chunk.postPauseMs);
      };
      utterance.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        this.callbacks.onError?.(`音声合成エラー: ${e.error}`);
        this.stop();
      };
      synth.speak(utterance);
    };

    if (chunk.prePauseMs > 0) this.timer = setTimeout(speak, chunk.prePauseMs);
    else speak();
  }

  private updateState(next: ReaderState): void {
    this.state = next;
    this.callbacks.onStateChange?.(next);
  }
}

/** 読み上げ中の段落を画面中央へスクロールする（本文側は data-paragraph-index を付ける） */
export function scrollParagraphIntoView(paragraphIndex: number): void {
  if (typeof document === 'undefined') return;
  const el = document.querySelector(`[data-paragraph-index="${paragraphIndex}"]`);
  if (el instanceof HTMLElement) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
