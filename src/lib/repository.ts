import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient as createBrowserSupabase } from '@/lib/supabase/client';
import { INITIAL_ANSWER_LOGS, INITIAL_MOCK_EXAMS, INITIAL_TRAP_STATS } from '@/lib/mock-data/analytics';
import { MOCK_PASSAGES } from '@/lib/mock-data/passages';
import {
  applyAnswerToStats,
  buildEliminationTrace,
  emptyTrapStats,
} from '@/lib/scoring';
import {
  answerLogSchema,
  eliminationTraceEntrySchema,
  mockExamInputSchema,
  mockExamRecordSchema,
  submitAnswerInputSchema,
  trapTypeSchema,
  trapWeaknessStatSchema,
} from '@/lib/schemas';
import type { ActionResult } from '@/types/action';
import type {
  ActiveTrapType,
  AnswerLog,
  MockExamRecord,
  PassageItem,
  QuestionItem,
  TrapWeaknessStat,
} from '@/types/domain';

/**
 * ハイブリッドリポジトリ。
 *  - Supabase 接続 & ログイン済み: DB を正とし、localStorage にもミラー保存する。
 *  - それ以外（未設定・未ログイン・通信エラー）: localStorage / モックデータで完全動作する。
 * サーバー側は createRepository(await createServerClient(), null)、
 * ブラウザ側は createBrowserRepository() を使う。
 */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface SubmitAnswerResult {
  log: AnswerLog;
  question: QuestionItem;
  /** 更新後のトラップ別弱点統計 */
  stats: TrapWeaknessStat[];
  /** Supabase へ保存できたか（false = ローカルのみ） */
  synced: boolean;
}

export interface ExamAnalysisSummary {
  advice: string;
  /** 重点対策のトラップ種別 */
  weaknesses: ActiveTrapType[];
}

export interface Repository {
  listPassages(): Promise<PassageItem[]>;
  getPassage(passageId: string): Promise<PassageItem | null>;
  getTrapStats(): Promise<TrapWeaknessStat[]>;
  listAnswerLogs(limit?: number): Promise<AnswerLog[]>;
  submitAnswer(input: unknown): Promise<ActionResult<SubmitAnswerResult>>;
  listMockExams(): Promise<MockExamRecord[]>;
  addMockExam(input: unknown): Promise<ActionResult<MockExamRecord>>;
  /** 答案画像の AI 解析結果を、指定した模試の記録に保存する。 */
  attachExamAnalysis(examId: string, analysis: ExamAnalysisSummary): Promise<ActionResult<MockExamRecord>>;
  /** ローカル保存データを破棄し、初期データに戻す。 */
  resetLocalData(): void;
}

export const STORAGE_KEYS = {
  answerLogs: 'lv:v1:answer-logs',
  trapStats: 'lv:v1:trap-stats',
  mockExams: 'lv:v1:mock-exams',
} as const;

const MAX_LOCAL_LOGS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ----------------------------------------------------------------------------
// Local storage helpers
// ----------------------------------------------------------------------------

function readLocal<T>(storage: StorageLike | null, key: string, schema: z.ZodType<T>): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeLocal(storage: StorageLike | null, key: string, value: unknown): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過・プライベートモード等では保存を諦める（メモリ上の結果は返す）
  }
}

function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStats(stats: readonly TrapWeaknessStat[]): TrapWeaknessStat[] {
  const base = emptyTrapStats();
  return base.map((empty) => stats.find((s) => s.trapType === empty.trapType) ?? empty);
}

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(error.flatten().fieldErrors)) {
    if (messages && messages.length > 0) out[key] = messages;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Supabase row schemas (snake_case) → domain mapping
// ----------------------------------------------------------------------------

const rubricRowSchema = z.object({
  element: z.string(),
  points: z.number(),
  keywords: z.array(z.string()).default([]),
});

const stepRowSchema = z.object({ stepNumber: z.number(), title: z.string(), content: z.string() });

const clauseRowSchema = z.object({
  text: z.string(),
  status: z.enum(['VALID', 'FLAWED', 'NEUTRAL']),
  comment: z.string().default(''),
});

const choiceRowSchema = z.object({
  id: z.string(),
  question_id: z.string(),
  choice_label: z.number().int(),
  content: z.string(),
  is_correct: z.boolean(),
  primary_trap_type: trapTypeSchema,
  flaw_segment_text: z.string().nullable(),
  clause_breakdown_json: z.array(clauseRowSchema).default([]),
  trap_explanation: z.string(),
});

const questionRowSchema = z.object({
  id: z.string(),
  passage_id: z.string(),
  question_number: z.number().int(),
  question_type: z.enum(['MULTIPLE_CHOICE', 'DESCRIPTIVE_400']),
  prompt_text: z.string(),
  target_underline_id: z.string().nullable(),
  correct_choice_label: z.number().int().nullable(),
  descriptive_char_limit: z.number().int().nullable(),
  model_answer_text: z.string().nullable(),
  grading_rubric_json: z.array(rubricRowSchema).nullable(),
  logical_derivation_steps: z.array(stepRowSchema).default([]),
  explanation_summary: z.string(),
  choices: z.array(choiceRowSchema).default([]),
});

const logicalStructureSchema = z.object({
  mainThesis: z.string(),
  contrastAxis: z.object({
    negativePoleTitle: z.string(),
    negativePoleKeywords: z.array(z.string()),
    positivePoleTitle: z.string(),
    positivePoleKeywords: z.array(z.string()),
  }),
  paragraphRoles: z.array(z.object({ paragraphNumber: z.number(), role: z.string(), summary: z.string() })),
});

const EMPTY_STRUCTURE: z.infer<typeof logicalStructureSchema> = {
  mainThesis: '',
  contrastAxis: { negativePoleTitle: '', negativePoleKeywords: [], positivePoleTitle: '', positivePoleKeywords: [] },
  paragraphRoles: [],
};

const passageRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string(),
  source_work: z.string(),
  theme: z.enum(['PHILOSOPHY', 'SOCIOLOGY', 'AESTHETICS', 'LINGUISTICS', 'SCIENCE_ETHICS', 'CULTURE']),
  difficulty_level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  target_tier: z.enum(['MARCH', 'SOKEI', 'NATIONAL_HARD', 'TOKYO_KYOTO']),
  char_count: z.number().int(),
  standard_time_seconds: z.number().int(),
  paragraphs_json: z.array(
    z.object({
      paragraphNumber: z.number(),
      text: z.string(),
      underlines: z.array(z.object({ id: z.string(), label: z.string(), text: z.string() })).optional(),
    }),
  ),
  logical_structure_summary: logicalStructureSchema.catch(EMPTY_STRUCTURE),
  questions: z.array(questionRowSchema).default([]),
});

function toPassage(row: z.infer<typeof passageRowSchema>): PassageItem {
  const questions: QuestionItem[] = [...row.questions]
    .sort((a, b) => a.question_number - b.question_number)
    .map((q) => ({
      id: q.id,
      passageId: q.passage_id,
      questionNumber: q.question_number,
      questionType: q.question_type,
      promptText: q.prompt_text,
      targetUnderlineId: q.target_underline_id,
      correctChoiceLabel: q.correct_choice_label,
      descriptiveCharLimit: q.descriptive_char_limit ?? undefined,
      modelAnswerText: q.model_answer_text ?? undefined,
      gradingRubric: q.grading_rubric_json?.map((r, i) => ({ id: `rubric-${i + 1}`, ...r })),
      logicalDerivationSteps: q.logical_derivation_steps,
      explanationSummary: q.explanation_summary,
      choices: [...q.choices]
        .sort((a, b) => a.choice_label - b.choice_label)
        .map((c) => ({
          id: c.id,
          questionId: c.question_id,
          choiceLabel: c.choice_label,
          content: c.content,
          isCorrect: c.is_correct,
          primaryTrapType: c.primary_trap_type,
          flawSegmentText: c.flaw_segment_text,
          clauseBreakdown: c.clause_breakdown_json,
          trapExplanation: c.trap_explanation,
        })),
    }));

  return {
    id: row.id,
    title: row.title,
    author: row.author,
    sourceWork: row.source_work,
    theme: row.theme,
    difficultyLevel: row.difficulty_level,
    targetTier: row.target_tier,
    charCount: row.char_count,
    standardTimeSeconds: row.standard_time_seconds,
    paragraphs: row.paragraphs_json,
    logicalStructure: row.logical_structure_summary,
    questions,
  };
}

const statRowSchema = z.object({
  trap_type: trapTypeSchema,
  encountered_count: z.number().int(),
  trapped_count: z.number().int(),
  correctly_tagged_count: z.number().int(),
  weakness_score: z.coerce.number(),
});

const answerLogRowSchema = z.object({
  id: z.string(),
  passage_id: z.string(),
  question_id: z.string(),
  selected_choice_label: z.number().int().nullable(),
  is_correct: z.boolean(),
  elimination_trace_json: z.record(z.string(), eliminationTraceEntrySchema).catch({}),
  time_spent_ms: z.number().int(),
  confidence_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  created_at: z.string(),
});

const mockExamRowSchema = z.object({
  id: z.string(),
  exam_provider: z.string(),
  exam_name: z.string(),
  exam_date: z.string(),
  modern_japanese_score: z.number(),
  modern_japanese_max_score: z.number(),
  deviation_value: z.coerce.number().nullable(),
  self_reflection: z.string().nullable(),
  ai_overall_advice: z.string().nullable(),
});

// ----------------------------------------------------------------------------
// Repository factory
// ----------------------------------------------------------------------------

export function createRepository(supabase: SupabaseClient | null, storage: StorageLike | null): Repository {
  async function remoteUserId(): Promise<string | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.auth.getUser();
      return error ? null : (data.user?.id ?? null);
    } catch {
      return null;
    }
  }

  // ---- passages -----------------------------------------------------------

  async function listPassages(): Promise<PassageItem[]> {
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('passages')
          .select('*, questions(*, choices(*))')
          .eq('is_published', true)
          .order('created_at', { ascending: true });
        if (!error && data) {
          const passages = data.flatMap((row) => {
            const parsed = passageRowSchema.safeParse(row);
            return parsed.success ? [toPassage(parsed.data)] : [];
          });
          if (passages.length > 0) return passages;
        }
      } catch {
        // フォールバックへ
      }
    }
    return [...MOCK_PASSAGES];
  }

  async function getPassage(passageId: string): Promise<PassageItem | null> {
    const passages = await listPassages();
    return passages.find((p) => p.id === passageId) ?? null;
  }

  // ---- stats / logs -------------------------------------------------------

  function localStats(): TrapWeaknessStat[] {
    return normalizeStats(readLocal(storage, STORAGE_KEYS.trapStats, z.array(trapWeaknessStatSchema)) ?? INITIAL_TRAP_STATS);
  }

  function localLogs(): AnswerLog[] {
    return readLocal(storage, STORAGE_KEYS.answerLogs, z.array(answerLogSchema)) ?? [...INITIAL_ANSWER_LOGS];
  }

  async function remoteStats(userId: string): Promise<TrapWeaknessStat[] | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.from('user_trap_weaknesses').select('*').eq('user_id', userId);
      if (error || !data || data.length === 0) return null;
      const stats = data.flatMap((row): TrapWeaknessStat[] => {
        const parsed = statRowSchema.safeParse(row);
        if (!parsed.success || parsed.data.trap_type === 'NONE') return [];
        return [
          {
            trapType: parsed.data.trap_type,
            encounteredCount: parsed.data.encountered_count,
            trappedCount: parsed.data.trapped_count,
            correctlyTaggedCount: parsed.data.correctly_tagged_count,
            weaknessScore: parsed.data.weakness_score,
          },
        ];
      });
      return stats.length > 0 ? normalizeStats(stats) : null;
    } catch {
      return null;
    }
  }

  async function getTrapStats(): Promise<TrapWeaknessStat[]> {
    const userId = await remoteUserId();
    if (userId) {
      const remote = await remoteStats(userId);
      if (remote) return remote;
    }
    return localStats();
  }

  async function listAnswerLogs(limit = 50): Promise<AnswerLog[]> {
    const userId = await remoteUserId();
    if (userId && supabase) {
      try {
        const { data, error } = await supabase
          .from('answer_logs')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (!error && data) {
          return data.flatMap((row): AnswerLog[] => {
            const parsed = answerLogRowSchema.safeParse(row);
            if (!parsed.success) return [];
            const r = parsed.data;
            return [
              {
                id: r.id,
                passageId: r.passage_id,
                questionId: r.question_id,
                selectedChoiceLabel: r.selected_choice_label,
                isCorrect: r.is_correct,
                eliminationTrace: r.elimination_trace_json,
                timeSpentMs: r.time_spent_ms,
                confidenceLevel: r.confidence_level,
                createdAt: r.created_at,
              },
            ];
          });
        }
      } catch {
        // フォールバックへ
      }
    }
    return localLogs()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  // ---- submit answer ------------------------------------------------------

  async function submitAnswer(input: unknown): Promise<ActionResult<SubmitAnswerResult>> {
    const parsed = submitAnswerInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: '入力内容が正しくありません', fieldErrors: fieldErrorsOf(parsed.error) };
    }
    const data = parsed.data;

    const passage = await getPassage(data.passageId);
    const question = passage?.questions.find((q) => q.id === data.questionId);
    if (!passage || !question) return { success: false, error: '設問が見つかりません' };
    if (question.questionType !== 'MULTIPLE_CHOICE') {
      return { success: false, error: '選択問題以外の回答は、この関数では扱えません' };
    }
    const selected = question.choices.find((c) => c.choiceLabel === data.selectedChoiceLabel);
    if (!selected) return { success: false, error: '選択肢が存在しません' };

    const trace = buildEliminationTrace(question, data.elimination);
    const baseStats = await getTrapStats();
    const localNextStats = applyAnswerToStats(baseStats, question, selected.choiceLabel, trace);

    let log: AnswerLog = {
      id: newId(),
      passageId: passage.id,
      questionId: question.id,
      selectedChoiceLabel: selected.choiceLabel,
      isCorrect: selected.isCorrect,
      eliminationTrace: trace,
      timeSpentMs: data.timeSpentMs,
      confidenceLevel: data.confidenceLevel,
      createdAt: new Date().toISOString(),
    };
    let stats = localNextStats;
    let synced = false;

    // Supabase へ保存（DB のトリガーが user_trap_weaknesses を再計算する）
    const userId = await remoteUserId();
    if (supabase && userId && UUID_RE.test(passage.id) && UUID_RE.test(question.id)) {
      try {
        const { data: inserted, error } = await supabase
          .from('answer_logs')
          .insert({
            user_id: userId,
            passage_id: passage.id,
            question_id: question.id,
            selected_choice_id: UUID_RE.test(selected.id) ? selected.id : null,
            selected_choice_label: selected.choiceLabel,
            is_correct: selected.isCorrect,
            elimination_trace_json: trace,
            time_spent_ms: data.timeSpentMs,
            confidence_level: data.confidenceLevel,
          })
          .select('id, created_at')
          .single();
        if (!error && inserted) {
          const row = z.object({ id: z.string(), created_at: z.string() }).safeParse(inserted);
          if (row.success) log = { ...log, id: row.data.id, createdAt: row.data.created_at };
          synced = true;
          stats = (await remoteStats(userId)) ?? localNextStats;
        }
      } catch {
        // ローカル保存のみで続行
      }
    }

    // localStorage へミラー保存（ハイブリッドモードでは唯一の保存先）
    writeLocal(storage, STORAGE_KEYS.answerLogs, [log, ...localLogs()].slice(0, MAX_LOCAL_LOGS));
    writeLocal(storage, STORAGE_KEYS.trapStats, stats);

    return { success: true, data: { log, question, stats, synced } };
  }

  // ---- mock exams ---------------------------------------------------------

  function localExams(): MockExamRecord[] {
    return readLocal(storage, STORAGE_KEYS.mockExams, z.array(mockExamRecordSchema)) ?? [...INITIAL_MOCK_EXAMS];
  }

  const byDateAsc = (a: MockExamRecord, b: MockExamRecord) => a.examDate.localeCompare(b.examDate);

  async function listMockExams(): Promise<MockExamRecord[]> {
    const userId = await remoteUserId();
    if (userId && supabase) {
      try {
        const { data, error } = await supabase
          .from('mock_exams')
          .select('*')
          .eq('user_id', userId)
          .order('exam_date', { ascending: true });
        if (!error && data) {
          return data.flatMap((row): MockExamRecord[] => {
            const parsed = mockExamRowSchema.safeParse(row);
            if (!parsed.success) return [];
            const r = parsed.data;
            return [
              {
                id: r.id,
                examProvider: r.exam_provider,
                examName: r.exam_name,
                examDate: r.exam_date,
                modernJapaneseScore: r.modern_japanese_score,
                modernJapaneseMaxScore: r.modern_japanese_max_score,
                deviationValue: r.deviation_value ?? 0,
                selfReflection: r.self_reflection ?? '',
                aiOverallAdvice: r.ai_overall_advice ?? undefined,
              },
            ];
          });
        }
      } catch {
        // フォールバックへ
      }
    }
    return localExams().sort(byDateAsc);
  }

  async function addMockExam(input: unknown): Promise<ActionResult<MockExamRecord>> {
    const parsed = mockExamInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: '入力内容が正しくありません', fieldErrors: fieldErrorsOf(parsed.error) };
    }
    const v = parsed.data;
    let record: MockExamRecord = {
      id: newId(),
      examProvider: v.examProvider,
      examName: v.examName,
      examDate: v.examDate,
      modernJapaneseScore: v.modernJapaneseScore,
      modernJapaneseMaxScore: v.modernJapaneseMaxScore,
      deviationValue: v.deviationValue,
      selfReflection: v.selfReflection,
    };

    const userId = await remoteUserId();
    if (supabase && userId) {
      try {
        const { data, error } = await supabase
          .from('mock_exams')
          .insert({
            user_id: userId,
            exam_provider: record.examProvider,
            exam_name: record.examName,
            exam_date: record.examDate,
            modern_japanese_score: record.modernJapaneseScore,
            modern_japanese_max_score: record.modernJapaneseMaxScore,
            deviation_value: record.deviationValue,
            self_reflection: record.selfReflection,
          })
          .select('id')
          .single();
        const row = z.object({ id: z.string() }).safeParse(data);
        if (!error && row.success) record = { ...record, id: row.data.id };
      } catch {
        // ローカル保存のみで続行
      }
    }

    writeLocal(storage, STORAGE_KEYS.mockExams, [...localExams(), record].sort(byDateAsc));
    return { success: true, data: record };
  }

  async function attachExamAnalysis(examId: string, analysis: ExamAnalysisSummary): Promise<ActionResult<MockExamRecord>> {
    const exams = localExams();
    const target = exams.find((e) => e.id === examId);
    if (!target) return { success: false, error: '対象の模試が見つかりません' };

    const updated: MockExamRecord = {
      ...target,
      aiOverallAdvice: analysis.advice,
      analyzedWeaknesses: [...analysis.weaknesses],
    };

    const userId = await remoteUserId();
    if (supabase && userId && UUID_RE.test(examId)) {
      try {
        await supabase.from('mock_exams').update({ ai_overall_advice: analysis.advice }).eq('id', examId).eq('user_id', userId);
      } catch {
        // ローカル保存のみで続行
      }
    }
    writeLocal(storage, STORAGE_KEYS.mockExams, exams.map((e) => (e.id === examId ? updated : e)).sort(byDateAsc));
    return { success: true, data: updated };
  }

  function resetLocalData(): void {
    if (!storage) return;
    for (const key of Object.values(STORAGE_KEYS)) {
      try {
        storage.removeItem(key);
      } catch {
        // noop
      }
    }
  }

  return {
    listPassages,
    getPassage,
    getTrapStats,
    listAnswerLogs,
    submitAnswer,
    listMockExams,
    addMockExam,
    attachExamAnalysis,
    resetLocalData,
  };
}

/** ブラウザ用。Supabase 未設定なら localStorage + モックデータのみで動作する。 */
export function createBrowserRepository(): Repository {
  let storage: StorageLike | null = null;
  if (typeof window !== 'undefined') {
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
  }
  return createRepository(createBrowserSupabase(), storage);
}
