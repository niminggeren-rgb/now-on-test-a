import { z } from 'zod';
import { clampDelta } from '@/lib/exam-diagnosis';
import {
  ExamAnalysisSchema,
  ImportedMaterialSchema,
  SourceTypeEnum,
  TargetLevelEnum,
  type ExamAnalysisResult,
  type ImportedMaterial,
  type SourceType,
  type TargetLevel,
  type TrapType,
} from '@/types/ai-pipeline';

/**
 * 取り込んだ教材・模試診断由来の弱点スコア・講師カルテ記録の永続化。
 * 現時点では Supabase にテーブルが無いため localStorage に保存する（SSR・保存不可環境では何もしない）。
 */

const CUSTOM_PASSAGES_KEY = 'lv_custom_imported_passages';
const TRAP_WEAKNESS_KEY = 'lv_user_trap_weaknesses';
const INSTRUCTOR_CARTE_KEY = 'lv_instructor_exam_advices';
const MAX_STORED_MATERIALS = 30;
const MAX_STORED_CARTES = 100;

// sourceType / targetLevel は Phase 7 で追加。それ以前に保存された教材も読めるよう optional
const storedMaterialSchema = ImportedMaterialSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  sourceType: SourceTypeEnum.optional(),
  targetLevel: TargetLevelEnum.optional(),
});
const trapWeaknessSchema = z.object({
  overstatement: z.number(),
  causal_inversion: z.number(),
  substitution: z.number(),
  unmentioned: z.number(),
  subject_object_reversal: z.number(),
  updatedAt: z.string(),
});
const carteRecordSchema = z.object({
  id: z.string(),
  examTitle: z.string(),
  estimatedScoreRate: z.number(),
  headline: z.string(),
  actionPlan: z.array(z.string()),
  overallSummary: z.string(),
  createdAt: z.string(),
});

export type StoredCustomMaterial = z.infer<typeof storedMaterialSchema>;
export type TrapWeaknessScores = z.infer<typeof trapWeaknessSchema>;
export type InstructorCarteRecord = z.infer<typeof carteRecordSchema>;

type WeaknessKey = Exclude<TrapType, 'none'>;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 壊れたレコードだけを捨て、読めるものは残す */
function readList<T>(key: string, schema: z.ZodType<T>): T[] {
  const raw = storage()?.getItem(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const r = schema.safeParse(item);
      return r.success ? [r.data] : [];
    });
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): boolean {
  try {
    const s = storage();
    if (!s) return false;
    s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // 容量超過など
  }
}

/** custom_passages.id (UUID) とそのまま対応させるため、教材IDは UUID で採番する */
function newMaterialId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? newId('custom');
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 実績が無い間は全トラップ 0（ダミー値を見せない） */
function emptyWeaknesses(): TrapWeaknessScores {
  return {
    overstatement: 0,
    causal_inversion: 0,
    substitution: 0,
    unmentioned: 0,
    subject_object_reversal: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

export const customMaterialRepository = {
  /** 取り込んだ教材を保存して返す。保存できない環境（容量超過等）では null */
  saveImportedMaterial(
    material: ImportedMaterial,
    meta: { sourceType?: SourceType; targetLevel?: TargetLevel } = {},
  ): StoredCustomMaterial | null {
    const record: StoredCustomMaterial = {
      ...material,
      ...meta,
      id: newMaterialId(),
      createdAt: new Date().toISOString(),
    };
    const list = [record, ...this.getAllImportedMaterials()].slice(0, MAX_STORED_MATERIALS);
    return write(CUSTOM_PASSAGES_KEY, list) ? record : null;
  },

  /** 既存の保存済み教材を編集内容で上書きする */
  updateImportedMaterial(id: string, material: ImportedMaterial): StoredCustomMaterial | null {
    const list = this.getAllImportedMaterials();
    const current = list.find((m) => m.id === id);
    if (!current) return null;
    const record: StoredCustomMaterial = {
      ...material,
      sourceType: current.sourceType,
      targetLevel: current.targetLevel,
      id,
      createdAt: current.createdAt,
    };
    return write(CUSTOM_PASSAGES_KEY, list.map((m) => (m.id === id ? record : m))) ? record : null;
  },

  deleteImportedMaterial(id: string): void {
    write(CUSTOM_PASSAGES_KEY, this.getAllImportedMaterials().filter((m) => m.id !== id));
  },

  /** クラウドから取り込んだ教材をローカルのキャッシュへ（同じIDは上書き） */
  mergeImportedMaterials(incoming: readonly StoredCustomMaterial[]): StoredCustomMaterial[] {
    const byId = new Map(this.getAllImportedMaterials().map((m) => [m.id, m]));
    for (const m of incoming) byId.set(m.id, m);
    const merged = [...byId.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_STORED_MATERIALS);
    write(CUSTOM_PASSAGES_KEY, merged);
    return merged;
  },

  getAllImportedMaterials(): StoredCustomMaterial[] {
    return readList(CUSTOM_PASSAGES_KEY, storedMaterialSchema);
  },

  getImportedMaterialById(id: string): StoredCustomMaterial | null {
    return this.getAllImportedMaterials().find((m) => m.id === id) ?? null;
  },

  /** 現在の弱点トラップスコア（記録が無ければ全て 0） */
  getTrapWeaknesses(): TrapWeaknessScores {
    const raw = storage()?.getItem(TRAP_WEAKNESS_KEY);
    if (!raw) return emptyWeaknesses();
    try {
      const parsed = trapWeaknessSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : emptyWeaknesses();
    } catch {
      return emptyWeaknesses();
    }
  },

  /** 模試W解析の結果を弱点スコアと講師カルテへ同期する */
  syncExamAnalysisToCarte(rawAnalysis: ExamAnalysisResult): {
    updatedWeaknesses: TrapWeaknessScores;
    carteRecord: InstructorCarteRecord;
  } {
    const analysis = ExamAnalysisSchema.parse(rawAnalysis);
    const current = this.getTrapWeaknesses();
    const d = analysis.trapWeaknessDelta;
    const updatedWeaknesses: TrapWeaknessScores = {
      overstatement: clamp(current.overstatement + clampDelta(d.overstatement)),
      causal_inversion: clamp(current.causal_inversion + clampDelta(d.causal_inversion)),
      substitution: clamp(current.substitution + clampDelta(d.substitution)),
      unmentioned: clamp(current.unmentioned + clampDelta(d.unmentioned)),
      subject_object_reversal: clamp(current.subject_object_reversal + clampDelta(d.subject_object_reversal)),
      updatedAt: new Date().toISOString(),
    };
    const carteRecord: InstructorCarteRecord = {
      id: newId('carte'),
      examTitle: analysis.examTitle,
      estimatedScoreRate: analysis.estimatedScoreRate,
      headline: analysis.instructorAdvice.headline,
      actionPlan: analysis.instructorAdvice.actionPlan,
      overallSummary: analysis.overallSummary,
      createdAt: new Date().toISOString(),
    };
    write(TRAP_WEAKNESS_KEY, updatedWeaknesses);
    write(INSTRUCTOR_CARTE_KEY, [carteRecord, ...this.getInstructorCarteRecords()].slice(0, MAX_STORED_CARTES));
    return { updatedWeaknesses, carteRecord };
  },

  /** 特訓問題の正解時に該当トラップの弱点スコアを 8pt 改善する */
  rewardTrapOvercome(trap: TrapType): TrapWeaknessScores {
    const current = this.getTrapWeaknesses();
    if (trap === 'none') return current;
    const key: WeaknessKey = trap;
    const updated: TrapWeaknessScores = {
      ...current,
      [key]: Math.max(0, current[key] - 8),
      updatedAt: new Date().toISOString(),
    };
    write(TRAP_WEAKNESS_KEY, updated);
    return updated;
  },

  getInstructorCarteRecords(): InstructorCarteRecord[] {
    return readList(INSTRUCTOR_CARTE_KEY, carteRecordSchema);
  },
};
