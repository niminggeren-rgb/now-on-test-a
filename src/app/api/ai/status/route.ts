import { NextResponse } from 'next/server';
import { getGeminiClient } from '@/lib/gemini/client';

// ビルド時に評価されると、キー未設定のまま「not configured」が固定されてしまうため常に動的に返す
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return NextResponse.json(
    {
      gemini: getGeminiClient() !== null,
      supabase: !!supabaseUrl && !!supabaseKey && !supabaseKey.startsWith('your-'),
      appMode: process.env.NEXT_PUBLIC_APP_MODE ?? 'hybrid',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
