'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Compass, Layers, RotateCcw, Scissors, Search, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PROTOCOL_STEP_IDS,
  SIX_MAJOR_TRAPS,
  VERNACULAR_PROTOCOL_STEPS,
  type MentorChatMessage,
  type ProtocolStepId,
  type ProtocolWeaknessMatrix,
} from '@/types/protocol';

interface SocratesMentorPanelProps {
  passageTitle: string;
  paragraphs: string[];
  questionText: string;
  underlinedPart: string;
  underlinedParagraphNumber: number;
  choices: { id: string; text: string }[];
  weaknessMatrix?: ProtocolWeaknessMatrix | null;
}

const STEP_ICONS: Record<ProtocolStepId, ReactNode> = {
  STEP_1: <Layers className="h-3.5 w-3.5" aria-hidden />,
  STEP_2: <Compass className="h-3.5 w-3.5" aria-hidden />,
  STEP_3: <Search className="h-3.5 w-3.5" aria-hidden />,
  STEP_4: <Scissors className="h-3.5 w-3.5" aria-hidden />,
};

const QUICK_PROMPTS: { step: ProtocolStepId; chip: string; prompt: string }[] = [
  { step: 'STEP_1', chip: 'Step 1: 二項対立を確認', prompt: 'この本文全体の二項対立（A vs B）のヒントを教えて' },
  { step: 'STEP_2', chip: 'Step 2: 傍線部を解体', prompt: '傍線部をどう分解すればいいか手がかりを教えて' },
  { step: 'STEP_3', chip: 'Step 3: 根拠段落の探索', prompt: 'どの論理マーカーを目印に根拠を探せばいい？' },
  { step: 'STEP_4', chip: 'Step 4: 選択肢の節分割', prompt: '選択肢で迷っています。どう節に区切って比較すればいい？' },
];

const PROTOCOL_TAG = /^\[PROTOCOL:(STEP_[1-4])\]\s*/;

function openingMessage(underlinedPart: string): MentorChatMessage {
  return {
    role: 'assistant',
    activeStep: 'STEP_2',
    content: `まずは Step 2: 傍線部の論理解体 から始めよう。\n傍線部「${underlinedPart}」の中に、復元すべき指示語や比喩はあるかな？ また、この設問は「理由」と「換言」のどちらを求めているだろう？`,
  };
}

/** 演習画面に常駐する、ソクラテス式の AI メンター。答えは教えず、Vernacular Protocol の各 Step へ引き戻す。 */
export function SocratesMentorPanel({
  passageTitle,
  paragraphs,
  questionText,
  underlinedPart,
  underlinedParagraphNumber,
  choices,
  weaknessMatrix,
}: SocratesMentorPanelProps) {
  const [activeStep, setActiveStep] = useState<ProtocolStepId>('STEP_2');
  const [messages, setMessages] = useState<MentorChatMessage[]>(() => [openingMessage(underlinedPart)]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // パネルを閉じる・設問が変わったときに、送信中のストリームを止める
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = async (text: string, forcedStep?: ProtocolStepId) => {
    const content = text.trim();
    if (!content || streaming) return;
    const history: MentorChatMessage[] = [...messages, { role: 'user', content, activeStep: forcedStep ?? activeStep }];
    setMessages([...history, { role: 'assistant', content: '', activeStep: forcedStep ?? activeStep }]);
    setInput('');
    setStreaming(true);

    const setLast = (patch: Partial<MentorChatMessage>) =>
      setMessages((prev) => prev.map((m, i) => (i === prev.length - 1 ? { ...m, ...patch } : m)));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/ai/mentor-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          passageTitle,
          paragraphs,
          questionText,
          underlinedPart,
          underlinedParagraphNumber,
          choices,
          targetStep: forcedStep,
          // 最初の挨拶（assistant）で始まる履歴は API が受け付けないので、最初の生徒発言から送る
          messages: history.slice(history.findIndex((m) => m.role === 'user')).map(({ role, content: c }) => ({ role, content: c })),
          weaknessMatrix: weaknessMatrix ?? undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'AIメンターとの通信に失敗しました。');
      }
      const headerStep = res.headers.get('X-Vernacular-Protocol-Step');
      let step: ProtocolStepId = forcedStep ?? activeStep;
      if (headerStep && headerStep in VERNACULAR_PROTOCOL_STEPS) step = headerStep as ProtocolStepId;
      setActiveStep(step);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const tag = PROTOCOL_TAG.exec(acc);
        if (tag) {
          step = tag[1] as ProtocolStepId;
          setActiveStep(step);
        }
        setLast({ content: acc.replace(PROTOCOL_TAG, ''), activeStep: step });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setLast({ content: err instanceof Error ? err.message : '通信エラーが発生しました。' });
    } finally {
      setStreaming(false);
    }
  };

  const trap = weaknessMatrix?.mostFrequentTrap ? SIX_MAJOR_TRAPS[weaknessMatrix.mostFrequentTrap] : null;
  const trapRate = weaknessMatrix?.mostFrequentTrap ? weaknessMatrix.trapStats[weaknessMatrix.mostFrequentTrap]?.failureRate : null;

  const stat = weaknessMatrix?.mostFrequentTrap ? weaknessMatrix.trapStats[weaknessMatrix.mostFrequentTrap] : null;
  const trapSample = stat ? `${stat.failed}/${stat.encountered}回` : '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-xs text-muted">
            <Sparkles className="h-4 w-4 text-accent" aria-hidden />
            答えは教えず、思考の型へ導きます
          </p>
          <button
            type="button"
            aria-label="対話をリセット"
            onClick={() => {
              abortRef.current?.abort();
              setStreaming(false);
              setActiveStep('STEP_2');
              setMessages([openingMessage(underlinedPart)]);
            }}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-foreground/5 hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div role="group" aria-label="プロトコルのステップ" className="grid grid-cols-4 gap-1 rounded-lg border bg-background p-1">
          {PROTOCOL_STEP_IDS.map((id) => {
            const meta = VERNACULAR_PROTOCOL_STEPS[id];
            return (
              <button
                key={id}
                type="button"
                aria-pressed={activeStep === id}
                onClick={() => setActiveStep(id)}
                className={cn(
                  'flex min-h-11 flex-col items-center justify-center rounded-md px-1 text-[10px] transition-colors',
                  activeStep === id ? 'bg-accent text-white' : 'text-muted hover:text-foreground',
                )}
              >
                <span className="flex items-center gap-1 font-bold">
                  {STEP_ICONS[id]}Step {meta.stepNumber}
                </span>
                <span className="mt-0.5 max-w-full truncate">{meta.japaneseTitle.slice(0, 5)}</span>
              </button>
            );
          })}
        </div>

        {trap && trapRate !== null && trapRate !== undefined && trapRate > 0 && (
          <p className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            要注意: {trap.label}（失点率 {trapRate}% ・{trapSample}）
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}>
            {m.role === 'assistant' && m.activeStep && (
              <span className="mb-1 inline-flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                {STEP_ICONS[m.activeStep]}Step {VERNACULAR_PROTOCOL_STEPS[m.activeStep].stepNumber}: {VERNACULAR_PROTOCOL_STEPS[m.activeStep].japaneseTitle}
              </span>
            )}
            <div
              className={cn(
                'max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs leading-relaxed',
                m.role === 'user' ? 'rounded-br-none bg-accent text-white' : 'rounded-bl-none border bg-background',
              )}
            >
              {m.content || (streaming && i === messages.length - 1 ? '考えています…' : '')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-t px-3 py-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.step}
            type="button"
            disabled={streaming}
            onClick={() => void send(q.prompt, q.step)}
            className="min-h-9 shrink-0 rounded-full border px-3 text-[11px] text-muted hover:text-foreground disabled:opacity-40"
          >
            {q.chip}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t p-3"
      >
        <input
          type="text"
          value={input}
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          placeholder="「なんでウがダメなの？」「どこを見ればいい？」"
          disabled={streaming}
          aria-label="メンターへの質問"
          className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          aria-label="送信"
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </form>
    </div>
  );
}
