-- ============================================================================
-- Phase 9 & 10: Vernacular Protocol（プロトコル別弱点マトリクス・演習ログ・二項対立キャッシュ）
-- Idempotent: 再実行しても安全。schema.sql にも同じ定義を含む。
-- 未計測の Step は NULL（ダミーの初期点数は持たない）。
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.protocol_weakness_matrix (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    total_attempts INTEGER NOT NULL DEFAULT 0,
    step1_macro_score NUMERIC(5,2) CHECK (step1_macro_score IS NULL OR (step1_macro_score >= 0 AND step1_macro_score <= 100)),
    step2_deconstruct_score NUMERIC(5,2) CHECK (step2_deconstruct_score IS NULL OR (step2_deconstruct_score >= 0 AND step2_deconstruct_score <= 100)),
    step3_navigation_score NUMERIC(5,2) CHECK (step3_navigation_score IS NULL OR (step3_navigation_score >= 0 AND step3_navigation_score <= 100)),
    step4_elimination_score NUMERIC(5,2) CHECK (step4_elimination_score IS NULL OR (step4_elimination_score >= 0 AND step4_elimination_score <= 100)),
    weakest_step TEXT NOT NULL DEFAULT 'STEP_4' CHECK (weakest_step IN ('STEP_1', 'STEP_2', 'STEP_3', 'STEP_4')),
    trap_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    most_frequent_trap TEXT CHECK (most_frequent_trap IS NULL OR most_frequent_trap IN (
        'overstatement', 'causal_reversal', 'substitution', 'unmentioned', 'subject_object_inversion', 'local_contradiction'
    )),
    clinical_prescription TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.protocol_attempt_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    passage_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    selected_choice_id TEXT NOT NULL,
    correct_choice_id TEXT NOT NULL,
    step1_delta_score NUMERIC(5,2),
    step2_delta_score NUMERIC(5,2),
    step3_delta_score NUMERIC(5,2),
    step4_delta_score NUMERIC(5,2) NOT NULL,
    selected_choice_trap TEXT,
    student_referenced_paragraphs INTEGER[] NOT NULL DEFAULT '{}',
    correct_evidence_paragraphs INTEGER[] NOT NULL DEFAULT '{}',
    slash_segmentation_quality NUMERIC(4,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_protocol_attempt_logs_user_created
    ON public.protocol_attempt_logs (user_id, created_at DESC);

-- 二項対立ダイアグラムの共有キャッシュ。キーは本文のハッシュ。
-- RLS を有効にしてポリシーを作らない＝service role（サーバーのルート）だけが読み書きできる。
CREATE TABLE IF NOT EXISTS public.passage_logic_diagrams (
    content_hash TEXT PRIMARY KEY,
    diagram_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.protocol_weakness_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_attempt_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passage_logic_diagrams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own protocol matrix" ON public.protocol_weakness_matrix;
CREATE POLICY "Users manage own protocol matrix" ON public.protocol_weakness_matrix
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own protocol attempt logs" ON public.protocol_attempt_logs;
CREATE POLICY "Users manage own protocol attempt logs" ON public.protocol_attempt_logs
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
