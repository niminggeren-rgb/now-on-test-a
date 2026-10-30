import { NextResponse } from 'next/server';
import { resolveGeminiKey } from '@/lib/gemini/client';
import { resolveNvidiaBaseUrl, resolveNvidiaKey, resolveNvidiaModel } from '@/lib/nvidia/client';

// ビルド時に評価されると、キー未設定のまま「not configured」が固定されてしまうため常に動的に返す
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = resolveGeminiKey();
  const nvidiaKey = resolveNvidiaKey();
  return NextResponse.json(
    {
      gemini: key !== null,
      // 診断用: 値そのものは返さない。Vercel で Preview/Production のどちらに設定したかの確認に使う
      geminiKeySource: key?.source ?? null,
      nvidia: nvidiaKey !== null,
      nvidiaKeySource: nvidiaKey?.source ?? null,
      nvidiaModel: nvidiaKey ? resolveNvidiaModel() : null,
      nvidiaBaseUrl: nvidiaKey ? resolveNvidiaBaseUrl() : null,
      deployEnv: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      supabase: !!supabaseUrl && !!supabaseKey && !supabaseKey.startsWith('your-'),
      appMode: process.env.NEXT_PUBLIC_APP_MODE ?? 'hybrid',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
