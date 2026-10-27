-- ============================================================================
-- Logical Vernacular - Phase 7: 万能教材インジェクター (custom_passages)
-- テキスト貼り付け / カメラ撮影から生成した教材を端末間で同期する。
-- Idempotent: 再実行しても安全。schema.sql にも同じ定義を含む。
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.custom_passages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '出典不明',
    source_type TEXT NOT NULL CHECK (source_type IN ('TEXT_PASTE', 'IMAGE_OCR')),
    target_level TEXT NOT NULL CHECK (target_level IN ('COMMON_TEST', 'MARCH', 'SOKEI', 'NATIONAL_HARD')),
    paragraphs JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ paragraphNumber, content }]
    underlines JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ id, label, exactText, paragraphNumber }]
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,    -- 4択・トラップ分類・スラッシュ分割・根拠
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,     -- { difficulty, ... }
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_passages_user ON public.custom_passages(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_custom_passages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_custom_passages_updated_at ON public.custom_passages;
CREATE TRIGGER set_custom_passages_updated_at
    BEFORE UPDATE ON public.custom_passages
    FOR EACH ROW EXECUTE FUNCTION public.touch_custom_passages_updated_at();

ALTER TABLE public.custom_passages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own or public custom passages" ON public.custom_passages;
CREATE POLICY "View own or public custom passages" ON public.custom_passages
    FOR SELECT USING (auth.uid() = user_id OR is_public = true);

DROP POLICY IF EXISTS "Insert own custom passages" ON public.custom_passages;
CREATE POLICY "Insert own custom passages" ON public.custom_passages
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Update own custom passages" ON public.custom_passages;
CREATE POLICY "Update own custom passages" ON public.custom_passages
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Delete own custom passages" ON public.custom_passages;
CREATE POLICY "Delete own custom passages" ON public.custom_passages
    FOR DELETE USING (auth.uid() = user_id);
