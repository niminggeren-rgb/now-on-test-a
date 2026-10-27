import { z } from 'zod';

/**
 * AI パイプライン（教材取り込み・模試W解析）が Gemini から受け取る構造化出力のスキーマ。
 * 既存の演習ドメイン型（`@/types/domain` の TrapType）とは別系統で、小文字IDを使う。
 * 相互変換は `@/lib/import-material` の `AI_TRAP_TO_DOMAIN` を参照。
 */

/** 現代文の5大誤答トラップ分類（正解は 'none'） */
export const TrapTypeEnum = z.enum([
  'overstatement', // 言い過ぎ・極端化
  'causal_inversion', // 因果逆転・相関と因果の混同
  'substitution', // 概念のすり替え
  'unmentioned', // 本文言及なし・常識による飛躍
  'subject_object_reversal', // 主客転倒
  'none', // 正解選択肢（トラップなし）
]);

export type TrapType = z.infer<typeof TrapTypeEnum>;

export const TRAP_LABELS: Record<TrapType, string> = {
  overstatement: '言い過ぎ・極端化',
  causal_inversion: '因果逆転',
  substitution: '概念のすり替え',
  unmentioned: '本文言及なし・飛躍',
  subject_object_reversal: '主客転倒',
  none: '正解（論理一致）',
};

/** 【Phase 7】教材の入力経路と志望校レベル */
export const SourceTypeEnum = z.enum(['TEXT_PASTE', 'IMAGE_OCR']);
export type SourceType = z.infer<typeof SourceTypeEnum>;

export const TargetLevelEnum = z.enum(['COMMON_TEST', 'MARCH', 'SOKEI', 'NATIONAL_HARD']);
export type TargetLevel = z.infer<typeof TargetLevelEnum>;

export const TARGET_LEVEL_LABELS: Record<TargetLevel, string> = {
  COMMON_TEST: '共通テスト',
  MARCH: 'MARCH',
  SOKEI: '早慶',
  NATIONAL_HARD: '難関国公立',
};

/** 【Phase 5】リアル教材カメラ取り込み（OCR＆自動問題化）の出力スキーマ */
export const ImportedChoiceSchema = z.object({
  id: z.string().describe('選択肢の記号（ア, イ, ウ, エ, オ または 1, 2, 3, 4, 5）'),
  text: z.string().describe('選択肢の全文'),
  isCorrect: z.boolean().describe('この選択肢が正解であるか'),
  trapType: TrapTypeEnum.describe("誤答の場合のトラップ分類。正解の場合は 'none'"),
  trapExplanation: z
    .string()
    .describe('なぜこの選択肢が正解なのか、またはどの部分が本文と矛盾しトラップになっているかの論理的解説'),
  slashSegments: z
    .array(
      z.object({
        segmentText: z.string().describe('選択肢を意味の塊で区切ったスラッシュ分割テキスト'),
        status: z
          .enum(['valid', 'trap', 'neutral'])
          .describe('本文と合致(valid)、キズ・誤り箇所(trap)、中立(neutral)'),
      }),
    )
    .describe('消去法スラッシュ演習用の選択肢分割データ（3〜5個程度に分割）'),
});

export const ImportedQuestionSchema = z.object({
  questionNumber: z.string().describe('問番号（例: 問一, 問1）'),
  targetUnderlineId: z.string().describe('対応する傍線部ID（例: underline-1）'),
  questionText: z.string().describe('設問文'),
  logicalHint: z.string().describe('解答を導くための着眼点ヒント（対比構造・指示語・言い換えなど）'),
  evidenceQuote: z.string().describe('正解の根拠となる本文中の該当箇所の抜粋'),
  choices: z.array(ImportedChoiceSchema).min(2).max(6),
});

export const ImportedMaterialSchema = z.object({
  title: z.string().describe('教材のタイトル（出典著者名・作品名、または推測されるテーマ名）'),
  author: z.string().describe("著者名（不明な場合は『出典不明（現代文評論）』）"),
  difficulty: z.enum(['standard', 'hard', 'extreme']).describe('文章・設問の難易度判定'),
  paragraphs: z
    .array(
      z.object({
        paragraphNumber: z.number(),
        content: z.string().describe('段落の本文テキスト（縦書き特有の段組み乱れや改行を自然に補正したもの）'),
      }),
    )
    .describe('段落ごとの本文リスト'),
  underlines: z.array(
    z.object({
      id: z.string().describe('例: underline-1'),
      label: z.string().describe('例: 傍線部① または 傍線部A'),
      exactText: z.string().describe('本文中で傍線が引かれている正確な文字列'),
      paragraphNumber: z.number().describe('この傍線部が含まれる段落番号'),
    }),
  ),
  questions: z.array(ImportedQuestionSchema),
});

export type ImportedMaterial = z.infer<typeof ImportedMaterialSchema>;

/** 【Phase 6】模試・定期テスト「問題＋答案」W画像解析の出力スキーマ */
export const QuestionDiagnosticSchema = z.object({
  questionNumber: z.string().describe('設問番号（例: 問1, 問2）'),
  questionType: z.enum(['multiple_choice', 'descriptive']).describe('選択問題か記述問題か'),
  studentAnswer: z.string().describe('答案画像から読み取った生徒の解答（選択記号または記述テキスト）'),
  correctAnswer: z.string().describe('AIが導出した正解記号または模範解答要素'),
  isCorrect: z.boolean().describe('正解かどうか'),
  detectedTrap: TrapTypeEnum.describe("生徒が引っかかった誤答トラップの分類（正解時は 'none'）"),
  readingErrorAnalysis: z.string().describe('本文のどこを読み違えたか、なぜその誤答に誘導されたかの原因診断'),
  descriptiveRubric: z
    .array(
      z.object({
        requiredElement: z.string().describe('記述答案に含まれるべき必須論理要素'),
        achieved: z.boolean().describe('生徒の答案にこの要素が含まれているか'),
        feedback: z.string().describe('要素の過不足に対する具体的な添削コメント'),
      }),
    )
    .describe('記述問題の場合の要素別採点マトリクス（選択問題の場合は空配列）'),
});

export const ExamAnalysisSchema = z.object({
  examTitle: z.string().describe("模試・テストの名称（画像から推測、または『現代文実戦演習』）"),
  estimatedScoreRate: z.number().min(0).max(100).describe('推定得点率（0〜100%）'),
  overallSummary: z.string().describe('今回の答案全体に見られる読解のクセ・失点パターンの総評'),
  questionDiagnostics: z.array(QuestionDiagnosticSchema),
  trapWeaknessDelta: z
    .object({
      overstatement: z.number().describe('言い過ぎトラップの弱点スコア変動値（0〜+25）'),
      causal_inversion: z.number().describe('因果逆転トラップの弱点スコア変動値（0〜+25）'),
      substitution: z.number().describe('すり替えトラップの弱点スコア変動値（0〜+25）'),
      unmentioned: z.number().describe('言及なしトラップの弱点スコア変動値（0〜+25）'),
      subject_object_reversal: z.number().describe('主客転倒トラップの弱点スコア変動値（0〜+25）'),
    })
    .describe('弱点レーダーチャートに反映する各トラップの危険度加算スコア'),
  instructorAdvice: z.object({
    headline: z.string().describe('講師カルテに表示する1行サマリー'),
    actionPlan: z.array(z.string()).describe('次回の指導で講師が生徒に徹底させるべき具体的な指導アクション3点'),
  }),
  remedialQuestion: z
    .object({
      targetTrap: TrapTypeEnum.describe('今回最も深刻だった弱点トラップ'),
      miniPassage: z.string().describe('同じ論理構造・トラップを鍛えるための250〜350字の特訓用評論文'),
      questionText: z.string().describe('特訓設問文'),
      choices: z
        .array(
          z.object({
            id: z.string(),
            text: z.string(),
            isCorrect: z.boolean(),
            explanation: z.string(),
          }),
        )
        .length(4)
        .describe('4択の特訓選択肢'),
    })
    .describe('診断直後にその場で弱点を潰すためのパーソナライズ特訓問題'),
});

export type ExamAnalysisResult = z.infer<typeof ExamAnalysisSchema>;
