import { z } from 'zod';
import { activeTrapTypeSchema } from '@/lib/schemas';
import { TRAP_METADATA_MAP, type ActiveTrapType } from '@/types/domain';

export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** 拡張子や Content-Type ではなく先頭バイト（マジックナンバー）で画像形式を判定する。 */
export function detectImageType(bytes: Uint8Array): AllowedImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  // WebP: "RIFF" <size> "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

const text = z.string().max(600);

/** Gemini が返す JSON（配列長・文字数を制限して受け入れる）。 */
export const examAnalysisRawSchema = z.object({
  summary: text,
  choiceTendencies: z.array(z.object({ trap: activeTrapTypeSchema, observation: text })).max(6),
  descriptiveIssues: z
    .array(z.object({ item: text, cause: text, lostPoints: z.string().max(60).optional() }))
    .max(6),
  focusTraps: z.array(z.object({ trap: activeTrapTypeSchema, reason: text })).max(3),
  nextActions: z.array(text).max(6),
});
export type ExamAnalysisRaw = z.infer<typeof examAnalysisRawSchema>;

export const examAnalysisSchema = examAnalysisRawSchema.extend({
  source: z.enum(['gemini', 'simulation']),
  notice: z.string().optional(),
});
export type ExamAnalysis = z.infer<typeof examAnalysisSchema>;

/** 解析結果を、模試の記録に保存する要約へ変換する。 */
export function toAnalysisSummary(a: ExamAnalysis): { advice: string; weaknesses: ActiveTrapType[] } {
  const actions = a.nextActions.slice(0, 2).join(' ');
  return {
    advice: [a.summary, actions].filter(Boolean).join(' '),
    weaknesses: a.focusTraps.map((f) => f.trap),
  };
}

/**
 * GEMINI_API_KEY 未設定時のフォールバック。画像は解析せず、渡された弱点トラップに基づく
 * 典型的な傾向レポートを返す。UI でもシミュレーションである旨を明示する。
 */
export function simulateExamAnalysis(weakTraps: readonly ActiveTrapType[]): ExamAnalysis {
  const traps: ActiveTrapType[] = weakTraps.length > 0 ? [...weakTraps].slice(0, 2) : ['PARTIAL_CONTRADICTION', 'CAUSAL_REVERSAL'];
  const labels = traps.map((t) => TRAP_METADATA_MAP[t].shortLabel).join('・');
  return {
    summary: `あなたの演習データでは「${labels}」の失点リスクが高く、答案でも同種の失点が出やすい傾向です。選択問題は最後の述語・因果の向きの照合不足、記述は対比と結論の限定の欠落が主な減点要因と推定されます。`,
    choiceTendencies: traps.map((trap) => ({
      trap,
      observation: `${TRAP_METADATA_MAP[trap].description} 確認ポイント: ${TRAP_METADATA_MAP[trap].checkPoint}`,
    })),
    descriptiveIssues: [
      {
        item: '対比構造の明示',
        cause: '筆者の批判対象と主張の二項対立が、「Aではなく B」の形で書かれておらず、片側の説明に偏っている可能性があります。',
        lostPoints: '5〜10点',
      },
      {
        item: '結論の限定表現',
        cause: '「〜ではなく」「〜のただ中で」といった本文の限定が落ち、主張が一般論に広がっている可能性があります。',
        lostPoints: '3〜5点',
      },
    ],
    focusTraps: traps.map((trap) => ({
      trap,
      reason: `直近の演習で弱点スコアが高く、次回の模試でも最優先で確認すべきトラップです。`,
    })),
    nextActions: [
      '選択肢を「／」で3〜4節に区切り、最後の述語まで本文と照合する。',
      '傍線部ごとに「原因→結果」の矢印を余白に書き、選択肢の因果と照合する。',
      '記述は「問題の指摘→対比→結論（限定付き）」の順で骨子を先に書いてから清書する。',
    ],
    source: 'simulation',
    notice: 'Gemini API が未設定のため、画像の内容は解析していません。表示は、あなたの弱点データに基づくシミュレーションです。',
  };
}
