import {
  ImportedMaterialSchema,
  type ImportedMaterial,
  type TrapType,
} from '@/types/ai-pipeline';
import { TRAP_METADATA_MAP, type ActiveTrapType } from '@/types/domain';

export const MAX_IMPORT_IMAGES = 6;
export const MAX_IMPORT_IMAGE_BYTES = 4 * 1024 * 1024;
export const MIN_PASTE_CHARS = 200;
export const MAX_PASTE_CHARS = 8000;

/** 取り込み用 AI のトラップID → 既存ドメインのトラップ種別 */
export const AI_TRAP_TO_DOMAIN: Record<Exclude<TrapType, 'none'>, ActiveTrapType> = {
  overstatement: 'OVERSTATEMENT',
  causal_inversion: 'CAUSAL_REVERSAL',
  substitution: 'CONCEPT_SWAP',
  unmentioned: 'UNMENTIONED',
  subject_object_reversal: 'SUBJECT_OBJECT_FLIP',
};

export function trapBadgeClass(trap: TrapType): string {
  if (trap === 'none') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  return TRAP_METADATA_MAP[AI_TRAP_TO_DOMAIN[trap]].badgeColorClass;
}

/** data URL のプレフィックスを除去して素の base64 を返す */
export function stripDataUrlPrefix(value: string): string {
  return value.replace(/^data:[^;,]+;base64,/, '');
}

/** base64 文字列から復号後のバイト数を概算する（巨大ペイロードを復号前に弾くため） */
export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Gemini の出力文字列を ImportedMaterial として検証する。コードフェンスは許容。失敗時は null。 */
export function parseImportedMaterialJson(textOut: string | undefined): ImportedMaterial | null {
  if (!textOut) return null;
  const cleaned = textOut.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = ImportedMaterialSchema.safeParse(JSON.parse(cleaned));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * 取り込み結果の整合性チェック。AI が誤読した箇所を、編集画面で受験生に確認してもらうための警告を返す。
 * 空配列なら問題なし。
 */
export function validateImportedMaterial(material: ImportedMaterial): string[] {
  const warnings: string[] = [];
  if (material.paragraphs.length === 0) warnings.push('本文が読み取れていません。');
  if (material.questions.length === 0) warnings.push('設問が読み取れていません。');

  const paragraphText = new Map(material.paragraphs.map((p) => [p.paragraphNumber, p.content]));
  for (const u of material.underlines) {
    const body = paragraphText.get(u.paragraphNumber);
    if (body === undefined || !body.includes(u.exactText)) {
      warnings.push(`${u.label}: 本文中に傍線部の文字列が見つかりません（OCRの誤読の可能性）。`);
    }
  }

  const underlineIds = new Set(material.underlines.map((u) => u.id));
  for (const q of material.questions) {
    if (!underlineIds.has(q.targetUnderlineId)) {
      warnings.push(`${q.questionNumber}: 対応する傍線部（${q.targetUnderlineId}）が見つかりません。`);
    }
    const correct = q.choices.filter((c) => c.isCorrect).length;
    if (correct !== 1) {
      warnings.push(`${q.questionNumber}: 正解の選択肢が${correct}個です（1個である必要があります）。`);
    }
    for (const c of q.choices) {
      if (c.isCorrect !== (c.trapType === 'none')) {
        warnings.push(`${q.questionNumber} [${c.id}]: 正誤とトラップ分類が一致していません。`);
      }
    }
  }
  return warnings;
}

/** 演習を始めてよい最低条件（本文・設問・各設問の正解が1つ） */
export function isPlayable(material: ImportedMaterial): boolean {
  return (
    material.paragraphs.length > 0 &&
    material.questions.length > 0 &&
    material.questions.every((q) => q.choices.filter((c) => c.isCorrect).length === 1)
  );
}

/**
 * テキストから AI が作問した教材に追加で課す条件（実物の取り込みと違い、選択肢の形を指定できるため）。
 * 4択・正解1つ・誤答3つのトラップ分類が互いに異なること。
 */
export function validateGeneratedMaterial(material: ImportedMaterial): string[] {
  const warnings: string[] = [];
  for (const q of material.questions) {
    if (q.choices.length !== 4) warnings.push(`${q.questionNumber}: 選択肢が${q.choices.length}個です（4択を想定）。`);
    const wrong = q.choices.filter((c) => !c.isCorrect).map((c) => c.trapType);
    if (new Set(wrong).size !== wrong.length) {
      warnings.push(`${q.questionNumber}: 誤答のトラップ分類が重複しています。`);
    }
    for (const c of q.choices) {
      if (!c.isCorrect && !c.slashSegments.some((s) => s.status === 'trap')) {
        warnings.push(`${q.questionNumber} [${c.id}]: 誤答なのに傷（トラップ節）が指定されていません。`);
      }
    }
  }
  return warnings;
}
