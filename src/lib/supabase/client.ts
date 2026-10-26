import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser 用 Supabase クライアント。
 * 環境変数が未設定の場合は null を返す（ハイブリッドモードでモックデータにフォールバック）。
 */
export function createClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || anonKey.startsWith('your-')) return null;
  return createBrowserClient(url, anonKey);
}
