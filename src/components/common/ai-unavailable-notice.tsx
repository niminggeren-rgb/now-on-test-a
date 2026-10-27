import { AlertTriangle } from 'lucide-react';
import type { AiStatus } from '@/hooks/use-ai-status';

/** サーバーが Gemini のキーを読めていないときだけ表示する案内（キーが読めていれば何も出さない） */
export function AiUnavailableNotice({ status }: { status: AiStatus | null }) {
  if (!status || status.gemini) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <div>
        <p className="font-semibold">AI解析が利用できません（サーバーが GEMINI_API_KEY を読み取れていません）。</p>
        <p className="mt-1 text-muted">
          実行環境: {status.deployEnv}。Vercel では、環境変数を Production だけでなく Preview にも設定したか、設定後に再デプロイしたかを確認してください。
        </p>
      </div>
    </div>
  );
}
