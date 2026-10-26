# CLAUDE.md - Logical Vernacular (受験OS: 現代文論理攻略モジュール)

## 1. Project Overview
「Logical Vernacular」は、MARCH・早慶・難関国公立大学を目指す受験生向けの現代文（評論文）論理的消去法トレーニング＆弱点解析プラットフォームである。
感覚的な読解を排除し、選択肢の「どこが・どのトラップ類型（言い過ぎ、因果逆転、概念すり替え、言及なし、主客転倒、局所的矛盾）によって誤りなのか」を構造的に識別・記録させ、受験生の思考の癖を定量化する。

## 2. Tech Stack & Core Libraries
- **Framework:** Next.js 15+ (App Router, React 19, TypeScript `strict: true`)
- **Styling:** Tailwind CSS v3.4+, `tailwindcss-animate`, CSS Variables (Slate/Zinc High-Contrast Theme)
- **UI Components:** shadcn/ui 方式 (Radix UI primitives を必要に応じて追加), Lucide React, Framer Motion
- **Charts & Visualization:** Recharts (トラップ別弱点レーダーチャート、模試得点推移)
- **Database / Auth / Storage:** Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **AI Integration:** Google GenAI SDK (`@google/genai` - `gemini-2.5-flash` for instant trap evaluation & OCR, `gemini-2.5-pro` for 400-char descriptive grading)
- **State & Data Fetching:** TanStack Query v5 (`@tanstack/react-query`), Nuqs (URL state management; 必要になったフェーズで追加)
- **Form & Validation:** React Hook Form, Zod v3 (`@hookform/resolvers/zod`)

## 3. Directory Structure
```text
.
├── CLAUDE.md
├── supabase/
│   ├── schema.sql                # 完全なDBスキーマ・RLS定義
│   └── seed.sql                  # 難関大レベルの初期評論文・設問・選択肢データ (Phase 2)
├── src/
│   ├── app/
│   │   ├── (auth)/               # ログイン・サインアップ画面
│   │   ├── (dashboard)/          # 認証後メインレイアウト (Sidebar + Command Header)
│   │   │   ├── page.tsx          # 弱点分析ダッシュボード & クイック演習開始
│   │   │   ├── practice/
│   │   │   │   ├── page.tsx      # 問題一覧・トラップ別重点演習フィルタ
│   │   │   │   └── [passageId]/
│   │   │   │       └── page.tsx  # コア演習画面 (Split View: 本文 + 論理消去UI)
│   │   │   ├── descriptive/
│   │   │   │   └── page.tsx      # 400字記述演習 & AI添削画面
│   │   │   ├── mock-exams/
│   │   │   │   └── page.tsx      # 模試成績記録 & 答案画像アップロード・AI弱点解析
│   │   │   └── instructor/
│   │   │       └── page.tsx      # 塾講師向け生徒カルテ・B2B管理ビュー
│   │   ├── api/
│   │   │   └── ai/
│   │   │       ├── evaluate-descriptive/route.ts
│   │   │       └── analyze-exam-sheet/route.ts
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                   # shadcn/ui プリミティブ
│   │   ├── layout/               # AppSidebar, TopBar, ShortcutHelpModal
│   │   ├── practice/             # PassageReader, ChoiceEliminator, TrapSelector, ExplanationDrawer
│   │   ├── dashboard/            # TrapRadarChart, WeaknessSummaryCard, RecentLogsTable
│   │   ├── mock-exams/           # ExamScoreForm, ExamSheetDropzone, ScoreTrendChart
│   │   └── instructor/           # StudentCarteView
│   ├── hooks/
│   │   ├── use-practice-shortcuts.ts # キーボードショートカット制御 (1-4, X, T, Space, V)
│   │   └── use-timer.ts              # ミリ秒単位の解答時間計測
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts         # Browser client
│   │   │   ├── server.ts         # Server component / Action client
│   │   │   └── middleware.ts     # Session refresh
│   │   ├── gemini/
│   │   │   └── client.ts         # Google GenAI SDK wrapper & prompts
│   │   ├── mock-data/
│   │   │   └── passages.ts       # オフライン/デモフォールバック用完全データセット
│   │   └── utils.ts
│   ├── server/
│   │   └── actions/              # Server Actions (submitAnswer, saveMockExam, etc.)
│   └── types/
│       ├── database.ts           # Supabase Schema Types
│       └── domain.ts             # アプリケーションドメイン型定義
```

## 4. Environment Variables (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
GEMINI_API_KEY=your-google-genai-api-key
NEXT_PUBLIC_APP_MODE=hybrid # 'supabase' | 'hybrid' (DB未接続時もモックデータで完全動作するモード)
```
雛形は `.env.local.example`。`.env.local` は絶対にコミットしない。

## 5. Coding Conventions & Architectural Rules
- **Strict Type Safety:**
  - `any` 型の使用は一切禁止（ESLint `no-explicit-any: error`）。`unknown` と Zod スキーマによるランタイム検証を組み合わせること。
  - 全ての Server Actions は統一された `ActionResult<T>`（`src/types/action.ts`）を返却し、例外を直接クライアントへスローしない。
    ```ts
    export type ActionResult<T> =
      | { success: true; data: T }
      | { success: false; error: string; fieldErrors?: Record<string, string[]> };
    ```
- **Server vs Client Component Separation:**
  - データフェッチを行う Page は原則 Server Component (`async function Page()`) とする。
  - キーボードイベント監視・アニメーション・消去法ステート管理を行う演習パネルは明確に `'use client'` を宣言し、細粒度のコンポーネントに分割する。
- **Hybrid Fallback Resilience:**
  - ローカル開発直後やSupabase未起動時でもUI/UXの全機能を即座に検証できるよう、`src/lib/mock-data/passages.ts` に難関大レベルの完全な評論文・設問・選択肢データを保持し、Supabase接続エラー時は自動的にフォールバックして動作させること。
  - Supabase クライアント生成関数は環境変数未設定時に `null` を返す。呼び出し側は必ず `null` を扱うこと。
- **Aesthetic & Typography Principles:**
  - デザインは Linear / Raycast を範とした高密度・高コントラストなミニマルUIとする。
  - 評論文の本文表示には明朝体（`font-serif`: Noto Serif JP / 游明朝）、UI・論理構造解説・トラップバッジにはサンセリフ（`font-sans`: Inter / Noto Sans JP）、ショートカットキー表記や数値には等幅フォント（`font-mono`: JetBrains Mono）を厳格に使い分ける。
  - 色は `globals.css` の CSS 変数（トークン）経由で参照し、コンポーネントに生の hex を書かない。
- **Keyboard-First UX:**
  - 演習画面ではマウスを一切使わずに「選択肢移動(1-4) → 消去線トグル(X) → トラップ理由タグ付け(T) → 回答確定(Space/Enter) → 次の問題(N) → 縦横書字方向切替(V)」が完結すること。

## 6. Essential Commands
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Type check (MUST pass with 0 errors before completing any task)
npx tsc --noEmit

# Lint & Build verification
npm run lint
npm run build

# Data / logic tests (no framework; plain tsx scripts)
npm run validate:data   # モック評論文データの整合性検証
npm run test:repo       # ハイブリッドリポジトリ・弱点スコア計算
npm run test:grading    # 400字ローカル採点・Gemini出力の正規化・本文セグメント化
```
`next dev` を同一ディレクトリで複数同時に起動しないこと（`.next` が壊れてチャンクが 404 になる）。
