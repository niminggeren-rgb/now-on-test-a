import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { OptionTrapTypeSchema, ProtocolStepIdSchema } from '@/lib/ai/schemas/protocolSchemas';
import { computeUpdatedWeaknessMatrix } from '@/lib/analytics/protocolScoring';
import { createClient } from '@/lib/supabase/client';
import type { ProtocolWeaknessMatrix, QuestionAttemptEvaluationInput } from '@/types/protocol';

/**
 * プロトコル別弱点マトリクスの永続化。
 * 端末（localStorage）に常に保存し、Supabase にログイン済みなら `protocol_weakness_matrix` /
 * `protocol_attempt_logs` にも同期する。記録が無い間は null（ダミーのスコアは返さない）。
 */

const MATRIX_KEY = 'lv_protocol_matrix_v1';
const LOCAL_USER_ID = 'local';

const score = z.number().min(0).max(100).nullable();
const trapStat = z.object({ encountered: z.number(), failed: z.number(), failureRate: z.number() });

const matrixSchema = z.object({
  userId: z.string(),
  totalAttempts: z.number().int().min(0),
  step1MacroScore: score,
  step2DeconstructScore: score,
  step3NavigationScore: score,
  step4EliminationScore: score,
  weakestStep: ProtocolStepIdSchema,
  trapStats: z.record(OptionTrapTypeSchema, trapStat),
  mostFrequentTrap: OptionTrapTypeSchema.nullable(),
  clinicalPrescription: z.string(),
  updatedAt: z.string(),
});

// PostgREST は numeric を数値で返すが、念のため文字列も受ける
const dbNumber = z.union([z.number(), z.string().transform(Number)]).pipe(z.number().min(0).max(100)).nullable();
const rowSchema = z.object({
  user_id: z.string(),
  total_attempts: z.number().int(),
  step1_macro_score: dbNumber,
  step2_deconstruct_score: dbNumber,
  step3_navigation_score: dbNumber,
  step4_elimination_score: dbNumber,
  weakest_step: ProtocolStepIdSchema,
  trap_stats: z.record(OptionTrapTypeSchema, trapStat),
  most_frequent_trap: OptionTrapTypeSchema.nullable(),
  clinical_prescription: z.string(),
  updated_at: z.string(),
});

function readLocal(): ProtocolWeaknessMatrix | null {
  try {
    const raw = window.localStorage.getItem(MATRIX_KEY);
    if (!raw) return null;
    const parsed = matrixSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as ProtocolWeaknessMatrix) : null;
  } catch {
    return null;
  }
}

function writeLocal(matrix: ProtocolWeaknessMatrix): void {
  try {
    window.localStorage.setItem(MATRIX_KEY, JSON.stringify(matrix));
  } catch {
    // 保存できない環境でも、演習自体は続けられる
  }
}

async function session(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = createClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user ? { supabase, userId: data.user.id } : null;
  } catch {
    return null;
  }
}

async function fetchRemote(s: { supabase: SupabaseClient; userId: string }): Promise<ProtocolWeaknessMatrix | null> {
  try {
    const { data, error } = await s.supabase.from('protocol_weakness_matrix').select('*').eq('user_id', s.userId).maybeSingle();
    if (error || !data) return null;
    const r = rowSchema.safeParse(data);
    if (!r.success) return null;
    const v = r.data;
    return {
      userId: v.user_id,
      totalAttempts: v.total_attempts,
      step1MacroScore: v.step1_macro_score,
      step2DeconstructScore: v.step2_deconstruct_score,
      step3NavigationScore: v.step3_navigation_score,
      step4EliminationScore: v.step4_elimination_score,
      weakestStep: v.weakest_step,
      trapStats: v.trap_stats as ProtocolWeaknessMatrix['trapStats'],
      mostFrequentTrap: v.most_frequent_trap,
      clinicalPrescription: v.clinical_prescription,
      updatedAt: v.updated_at,
    };
  } catch {
    return null;
  }
}

export type AttemptInput = Omit<QuestionAttemptEvaluationInput, 'userId'>;

export const protocolRepository = {
  /** 端末に保存された最新のマトリクス（同期読み出し） */
  getLocalMatrix(): ProtocolWeaknessMatrix | null {
    return typeof window === 'undefined' ? null : readLocal();
  },

  /** 最新のマトリクス。ログイン中でクラウドの記録の方が新しければそちらを採用して端末にも反映する。 */
  async getMatrix(): Promise<ProtocolWeaknessMatrix | null> {
    const local = this.getLocalMatrix();
    const s = await session();
    if (!s) return local;
    const remote = await fetchRemote(s);
    if (remote && (!local || remote.totalAttempts >= local.totalAttempts)) {
      writeLocal(remote);
      return remote;
    }
    return local;
  },

  /** 1問分の結果を取り込み、更新後のマトリクスを返す（端末は必ず更新。クラウド同期は失敗しても握りつぶす） */
  async recordAttempt(input: AttemptInput): Promise<ProtocolWeaknessMatrix> {
    const s = await session();
    const local = readLocal();
    const remote = s ? await fetchRemote(s) : null;
    // 未ログイン中に溜めた端末の記録は、初めて同期するときに引き継ぐ
    const base = remote && (!local || remote.totalAttempts >= local.totalAttempts) ? remote : local;
    const userId = s?.userId ?? LOCAL_USER_ID;

    const { updatedMatrix, attemptStepScores } = computeUpdatedWeaknessMatrix(base, { ...input, userId });
    writeLocal(updatedMatrix);

    if (s) {
      try {
        await s.supabase.from('protocol_weakness_matrix').upsert(
          {
            user_id: s.userId,
            total_attempts: updatedMatrix.totalAttempts,
            step1_macro_score: updatedMatrix.step1MacroScore,
            step2_deconstruct_score: updatedMatrix.step2DeconstructScore,
            step3_navigation_score: updatedMatrix.step3NavigationScore,
            step4_elimination_score: updatedMatrix.step4EliminationScore,
            weakest_step: updatedMatrix.weakestStep,
            trap_stats: updatedMatrix.trapStats,
            most_frequent_trap: updatedMatrix.mostFrequentTrap,
            clinical_prescription: updatedMatrix.clinicalPrescription,
            updated_at: updatedMatrix.updatedAt,
          },
          { onConflict: 'user_id' },
        );
        await s.supabase.from('protocol_attempt_logs').insert({
          user_id: s.userId,
          passage_id: input.passageId,
          question_id: input.questionId,
          is_correct: input.isCorrect,
          selected_choice_id: input.selectedChoiceId,
          correct_choice_id: input.correctChoiceId,
          step1_delta_score: attemptStepScores.step1Delta,
          step2_delta_score: attemptStepScores.step2Delta,
          step3_delta_score: attemptStepScores.step3Delta,
          step4_delta_score: attemptStepScores.step4Delta,
          selected_choice_trap: input.selectedChoiceTrap ?? null,
          student_referenced_paragraphs: input.studentReferencedParagraphs ?? [],
          correct_evidence_paragraphs: input.correctEvidenceParagraphs ?? [],
          slash_segmentation_quality: Math.round(input.slashSegmentationQuality * 100) / 100,
        });
      } catch {
        // 端末側の記録は済んでいる
      }
    }
    try {
      window.dispatchEvent(new Event('lv-protocol-updated'));
    } catch {
      // noop
    }
    return updatedMatrix;
  },
};
