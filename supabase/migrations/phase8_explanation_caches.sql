-- Phase 8: オンデマンド解説の共有キャッシュ。
-- service role（サーバーのルート）だけが読み書きする。RLS を有効にしてポリシーを作らないため、
-- 一般ユーザーは anon/authenticated キーからは一切アクセスできない（キャッシュ汚染の防止）。
CREATE TABLE IF NOT EXISTS public.explanation_caches (
    cache_key TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK (mode IN ('BINARY_OPPOSITION_MAP', 'THINKING_PROCESS')),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.explanation_caches ENABLE ROW LEVEL SECURITY;
