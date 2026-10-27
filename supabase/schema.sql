-- ============================================================================
-- Logical Vernacular - Complete PostgreSQL Schema for Supabase
-- Idempotent: safe to re-run in the SQL Editor / as a migration.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUM Types
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE target_tier AS ENUM ('MARCH', 'SOKEI', 'NATIONAL_HARD', 'TOKYO_KYOTO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE passage_theme AS ENUM (
        'PHILOSOPHY',      -- 哲学・思想・近代批判
        'SOCIOLOGY',       -- 社会学・共同体・メディア論
        'AESTHETICS',      -- 美学・芸術論・身体論
        'LINGUISTICS',     -- 言語論・記号論・コミュニケーション
        'SCIENCE_ETHICS',  -- 科学技術・生命倫理・環境
        'CULTURE'          -- 文化人類学・歴史認識・比較文化
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE question_type AS ENUM ('MULTIPLE_CHOICE', 'DESCRIPTIVE_400');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE trap_type AS ENUM (
        'NONE',                   -- 正解選択肢（トラップなし）
        'OVERSTATEMENT',          -- 言い過ぎ・極端な断定（常に・全く・のみ等）
        'CAUSAL_REVERSAL',        -- 因果関係の逆転・ねじれ
        'CONCEPT_SWAP',           -- 概念・対比軸のすり替え
        'UNMENTIONED',            -- 本文言及なし・外部常識の混入
        'SUBJECT_OBJECT_FLIP',    -- 主客転倒・行為主体の取り違え
        'PARTIAL_CONTRADICTION'   -- 前半合致・後半の局所的矛盾
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE exam_image_status AS ENUM ('PENDING', 'PROCESSING', 'ANALYZED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------

-- 2.1 Organizations (塾・校舎単位のB2Bテナント管理用)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2 Profiles (Users拡張テーブル)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    display_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'STUDENT',
    grade TEXT NOT NULL DEFAULT '高3', -- 高1, 高2, 高3, 既卒
    target_tier target_tier NOT NULL DEFAULT 'SOKEI',
    target_universities TEXT[] DEFAULT '{}',
    preferred_writing_mode TEXT NOT NULL DEFAULT 'horizontal' CHECK (preferred_writing_mode IN ('horizontal', 'vertical')),
    streak_days INTEGER NOT NULL DEFAULT 0,
    last_practiced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.3 Passages (現代文・評論文の本文データ)
CREATE TABLE IF NOT EXISTS public.passages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    source_work TEXT NOT NULL,
    theme passage_theme NOT NULL,
    difficulty_level SMALLINT NOT NULL CHECK (difficulty_level BETWEEN 1 AND 5),
    target_tier target_tier NOT NULL,
    char_count INTEGER NOT NULL,
    standard_time_seconds INTEGER NOT NULL DEFAULT 600,
    -- 段落構造や傍線部位置を含むリッチ本文データ
    -- [{ "paragraphNumber": 1, "text": "...", "underlines": [{ "id": "u1", "label": "傍線部(A)", "text": "..." }] }]
    paragraphs_json JSONB NOT NULL,
    raw_content TEXT NOT NULL,
    logical_structure_summary JSONB NOT NULL DEFAULT '{}'::jsonb, -- 対比軸・主張・結論の要約構造
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.4 Questions (設問データ：選択問題および400字記述問題)
CREATE TABLE IF NOT EXISTS public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passage_id UUID NOT NULL REFERENCES public.passages(id) ON DELETE CASCADE,
    question_number SMALLINT NOT NULL,
    question_type question_type NOT NULL DEFAULT 'MULTIPLE_CHOICE',
    prompt_text TEXT NOT NULL,
    target_underline_id TEXT,                   -- 本文中の対応する傍線部ID (例: "u1")
    correct_choice_label SMALLINT,              -- 選択問題の場合の正解番号 (1〜5)
    -- 400字記述用の模範解答と採点ルーブリック
    descriptive_char_limit INTEGER DEFAULT 400,
    model_answer_text TEXT,
    grading_rubric_json JSONB DEFAULT '[]'::jsonb, -- [{ "element": "対比の明示", "points": 30, "keywords": [...] }]
    -- 論理的導出プロセスの解説
    logical_derivation_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    explanation_summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (passage_id, question_number)
);

-- 2.5 Choices (選択肢データ：トラップ種別と傷の位置を保持)
CREATE TABLE IF NOT EXISTS public.choices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    choice_label SMALLINT NOT NULL CHECK (choice_label BETWEEN 1 AND 5),
    content TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    primary_trap_type trap_type NOT NULL DEFAULT 'NONE',
    -- 選択肢文中の「どこが致命的な誤り（傷）か」を示す部分文字列とインデックス
    flaw_segment_text TEXT,
    flaw_start_index INTEGER,
    flaw_end_index INTEGER,
    -- 選択肢を節（Clause）に分解して本文と照合するためのデータ
    clause_breakdown_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    trap_explanation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (question_id, choice_label)
);

-- 2.6 Answer Logs (生徒の演習・消去プロセス履歴)
CREATE TABLE IF NOT EXISTS public.answer_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    passage_id UUID NOT NULL REFERENCES public.passages(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    selected_choice_id UUID REFERENCES public.choices(id) ON DELETE SET NULL,
    selected_choice_label SMALLINT,
    is_correct BOOLEAN NOT NULL,
    -- 例: { "1": { "eliminated": true, "userTaggedTrap": "OVERSTATEMENT", "actualTrap": "OVERSTATEMENT", "isTrapMatch": true } }
    elimination_trace_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- 400字記述問題の回答データおよびAI添削結果
    descriptive_answer_text TEXT,
    ai_grading_score SMALLINT,
    ai_feedback_json JSONB,
    time_spent_ms INTEGER NOT NULL CHECK (time_spent_ms >= 0),
    confidence_level SMALLINT CHECK (confidence_level BETWEEN 1 AND 3), -- 1: 迷った, 2: 根拠あり, 3: 完全確信
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.7 User Trap Weaknesses (トラップ別の誤答率・識別精度の集計テーブル)
CREATE TABLE IF NOT EXISTS public.user_trap_weaknesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    trap_type trap_type NOT NULL CHECK (trap_type <> 'NONE'),
    encountered_count INTEGER NOT NULL DEFAULT 0,          -- このトラップを含む誤答選択肢に遭遇した回数
    trapped_count INTEGER NOT NULL DEFAULT 0,              -- このトラップ選択肢を「正解」として選んでしまった回数（致命傷）
    correctly_tagged_count INTEGER NOT NULL DEFAULT 0,     -- 消去時にトラップ種別まで正確に言い当てた回数
    weakness_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,     -- 0〜100の弱点スコア（高いほど要注意）
    last_trapped_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, trap_type)
);

-- 2.8 Mock Exams (模試・定期試験の得点推移記録)
CREATE TABLE IF NOT EXISTS public.mock_exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    exam_provider TEXT NOT NULL,       -- 河合塾, 駿台, 東進, 代ゼミ, 学校定期考査
    exam_name TEXT NOT NULL,           -- 第2回 全統記述模試 等
    exam_date DATE NOT NULL,
    modern_japanese_score SMALLINT NOT NULL,
    modern_japanese_max_score SMALLINT NOT NULL DEFAULT 100,
    deviation_value NUMERIC(4,1),      -- 偏差値 (例: 64.5)
    self_reflection TEXT,
    ai_overall_advice TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.9 Exam Images (答案用紙・問題用紙の写真アップロードとAI解析結果)
CREATE TABLE IF NOT EXISTS public.exam_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_exam_id UUID NOT NULL REFERENCES public.mock_exams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    image_category TEXT NOT NULL CHECK (image_category IN ('ANSWER_SHEET', 'QUESTION_PAPER', 'SCORE_REPORT')),
    ocr_extracted_text TEXT,
    ai_weakness_analysis_json JSONB DEFAULT '{}'::jsonb,
    status exam_image_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 3. Indexes for Performance
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_passages_theme_tier ON public.passages(theme, target_tier);
CREATE INDEX IF NOT EXISTS idx_questions_passage_id ON public.questions(passage_id);
CREATE INDEX IF NOT EXISTS idx_choices_question_id ON public.choices(question_id);
CREATE INDEX IF NOT EXISTS idx_choices_trap_type ON public.choices(primary_trap_type);
CREATE INDEX IF NOT EXISTS idx_answer_logs_user_created ON public.answer_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_logs_question ON public.answer_logs(question_id);
CREATE INDEX IF NOT EXISTS idx_user_trap_weaknesses_user_score ON public.user_trap_weaknesses(user_id, weakness_score DESC);
CREATE INDEX IF NOT EXISTS idx_mock_exams_user_date ON public.mock_exams(user_id, exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_exam_images_mock_exam ON public.exam_images(mock_exam_id);

-- ----------------------------------------------------------------------------
-- 4. Functions & Triggers
-- ----------------------------------------------------------------------------

-- 4.1 新規ユーザー登録時にプロフィールと6種のトラップ初期レコードを自動作成
--     ※ role はクライアント供給のメタデータを信用せず、常に STUDENT で作成する。
--       講師/管理者への昇格は service_role（管理画面・SQL）でのみ行う。
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    t trap_type;
BEGIN
    INSERT INTO public.profiles (id, display_name, role, grade, target_tier)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'STUDENT',
        COALESCE(NEW.raw_user_meta_data->>'grade', '高3'),
        COALESCE((NEW.raw_user_meta_data->>'target_tier')::target_tier, 'SOKEI')
    );

    FOREACH t IN ARRAY ARRAY[
        'OVERSTATEMENT'::trap_type,
        'CAUSAL_REVERSAL'::trap_type,
        'CONCEPT_SWAP'::trap_type,
        'UNMENTIONED'::trap_type,
        'SUBJECT_OBJECT_FLIP'::trap_type,
        'PARTIAL_CONTRADICTION'::trap_type
    ]
    LOOP
        INSERT INTO public.user_trap_weaknesses (user_id, trap_type)
        VALUES (NEW.id, t)
        ON CONFLICT (user_id, trap_type) DO NOTHING;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4.2 回答ログ記録時にトラップ弱点スコアを自動再計算する関数
CREATE OR REPLACE FUNCTION public.recalculate_trap_weakness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_choice RECORD;
    v_trace JSONB;
    v_user_tagged TEXT;
    v_trapped_inc INTEGER;
    v_tagged_inc INTEGER;
BEGIN
    -- 選択問題でない場合はスキップ
    IF NEW.selected_choice_label IS NULL THEN
        RETURN NEW;
    END IF;

    -- 当該設問の全誤答選択肢をループして統計を更新
    FOR v_choice IN
        SELECT choice_label, primary_trap_type
        FROM public.choices
        WHERE question_id = NEW.question_id
          AND is_correct = false
          AND primary_trap_type <> 'NONE'
    LOOP
        -- この誤答選択肢を最終回答として選んでしまったか
        v_trapped_inc := CASE WHEN NEW.selected_choice_label = v_choice.choice_label THEN 1 ELSE 0 END;

        -- 消去トレース内でトラップ種別を正しく識別できたか
        v_trace := NEW.elimination_trace_json -> (v_choice.choice_label::text);
        v_user_tagged := v_trace ->> 'userTaggedTrap';
        v_tagged_inc := CASE WHEN v_user_tagged = (v_choice.primary_trap_type::text) THEN 1 ELSE 0 END;

        INSERT INTO public.user_trap_weaknesses (
            user_id, trap_type, encountered_count, trapped_count, correctly_tagged_count, weakness_score, last_trapped_at, updated_at
        )
        VALUES (
            NEW.user_id,
            v_choice.primary_trap_type,
            1,
            v_trapped_inc,
            v_tagged_inc,
            LEAST(100.0, GREATEST(0.0, (v_trapped_inc * 75.0) + ((1 - v_tagged_inc) * 25.0))),
            CASE WHEN v_trapped_inc = 1 THEN now() ELSE NULL END,
            now()
        )
        ON CONFLICT (user_id, trap_type) DO UPDATE SET
            encountered_count = user_trap_weaknesses.encountered_count + 1,
            trapped_count = user_trap_weaknesses.trapped_count + v_trapped_inc,
            correctly_tagged_count = user_trap_weaknesses.correctly_tagged_count + v_tagged_inc,
            weakness_score = LEAST(
                100.0,
                ROUND(
                    (
                        ((user_trap_weaknesses.trapped_count + v_trapped_inc)::numeric / (user_trap_weaknesses.encountered_count + 1)::numeric) * 75.0
                        +
                        (1.0 - ((user_trap_weaknesses.correctly_tagged_count + v_tagged_inc)::numeric / (user_trap_weaknesses.encountered_count + 1)::numeric)) * 25.0
                    ),
                    2
                )
            ),
            last_trapped_at = CASE WHEN v_trapped_inc = 1 THEN now() ELSE user_trap_weaknesses.last_trapped_at END,
            updated_at = now();
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_answer_log_inserted ON public.answer_logs;
CREATE TRIGGER on_answer_log_inserted
    AFTER INSERT ON public.answer_logs
    FOR EACH ROW EXECUTE FUNCTION public.recalculate_trap_weakness();

-- 4.3 profiles.updated_at 自動更新
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4.4 一般ユーザーによる role / organization_id の自己変更を禁止（権限昇格防止）
--     auth.uid() が NULL（SQL Editor / service_role）の場合は変更を許可する。
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND (NEW.role IS DISTINCT FROM OLD.role
            OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN
        RAISE EXCEPTION 'role and organization_id cannot be changed by the user';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_columns
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ----------------------------------------------------------------------------
-- 5. Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trap_weaknesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_images ENABLE ROW LEVEL SECURITY;

-- 講師または管理者かどうか
CREATE OR REPLACE FUNCTION public.is_instructor_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('INSTRUCTOR', 'ADMIN')
    );
$$;

-- 呼び出し元が対象ユーザーのデータを閲覧できるか
-- （本人 / 管理者 / 同一組織の講師）
CREATE OR REPLACE FUNCTION public.can_view_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER SET search_path = public
STABLE
AS $$
    SELECT auth.uid() = target_user_id
        OR EXISTS (
            SELECT 1
            FROM public.profiles me
            JOIN public.profiles target ON target.id = target_user_id
            WHERE me.id = auth.uid()
              AND (
                  me.role = 'ADMIN'
                  OR (me.role = 'INSTRUCTOR'
                      AND me.organization_id IS NOT NULL
                      AND me.organization_id = target.organization_id)
              )
        );
$$;

-- Organizations: 所属メンバーのみ閲覧可
DROP POLICY IF EXISTS "Members can view own organization" ON public.organizations;
CREATE POLICY "Members can view own organization" ON public.organizations
    FOR SELECT USING (
        id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    );

-- Passages / Questions / Choices: 認証ユーザーが閲覧可能（編集は service_role / 管理者がDB直接操作）
DROP POLICY IF EXISTS "Passages are viewable by authenticated" ON public.passages;
CREATE POLICY "Passages are viewable by authenticated" ON public.passages
    FOR SELECT TO authenticated USING (is_published = true OR public.is_instructor_or_admin());
DROP POLICY IF EXISTS "Questions are viewable by authenticated" ON public.questions;
CREATE POLICY "Questions are viewable by authenticated" ON public.questions
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Choices are viewable by authenticated" ON public.choices;
CREATE POLICY "Choices are viewable by authenticated" ON public.choices
    FOR SELECT TO authenticated USING (true);

-- Profiles: 本人または同一組織の講師・管理者が閲覧可能、更新は本人のみ
DROP POLICY IF EXISTS "Users can view own profile or managed profiles" ON public.profiles;
CREATE POLICY "Users can view own profile or managed profiles" ON public.profiles
    FOR SELECT USING (public.can_view_user(id));
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Answer Logs: 本人が作成、本人＋担当講師が閲覧
DROP POLICY IF EXISTS "Users can insert own answer logs" ON public.answer_logs;
CREATE POLICY "Users can insert own answer logs" ON public.answer_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users and instructors can view answer logs" ON public.answer_logs;
CREATE POLICY "Users and instructors can view answer logs" ON public.answer_logs
    FOR SELECT USING (public.can_view_user(user_id));

-- User Trap Weaknesses: 本人＋担当講師が閲覧（更新はトリガーのみ）
DROP POLICY IF EXISTS "Users and instructors can view trap weaknesses" ON public.user_trap_weaknesses;
CREATE POLICY "Users and instructors can view trap weaknesses" ON public.user_trap_weaknesses
    FOR SELECT USING (public.can_view_user(user_id));

-- Mock Exams & Exam Images: 本人がCRUD、担当講師が閲覧
DROP POLICY IF EXISTS "Users manage own mock exams" ON public.mock_exams;
CREATE POLICY "Users manage own mock exams" ON public.mock_exams
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Instructors view managed mock exams" ON public.mock_exams;
CREATE POLICY "Instructors view managed mock exams" ON public.mock_exams
    FOR SELECT USING (public.can_view_user(user_id));

DROP POLICY IF EXISTS "Users manage own exam images" ON public.exam_images;
CREATE POLICY "Users manage own exam images" ON public.exam_images
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Instructors view managed exam images" ON public.exam_images;
CREATE POLICY "Instructors view managed exam images" ON public.exam_images
    FOR SELECT USING (public.can_view_user(user_id));

-- ----------------------------------------------------------------------------
-- 6. Storage: 答案・問題用紙画像バケット（非公開。パスは "<user_id>/<file>"）
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-images', 'exam-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users manage own exam image files" ON storage.objects;
CREATE POLICY "Users manage own exam image files" ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'exam-images' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'exam-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 7. Phase 7: custom_passages（万能教材インジェクター）
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- 8. Phase 8: explanation_caches（オンデマンド解説の共有キャッシュ）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.explanation_caches (
    cache_key TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK (mode IN ('BINARY_OPPOSITION_MAP', 'THINKING_PROCESS')),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.explanation_caches ENABLE ROW LEVEL SECURITY;
