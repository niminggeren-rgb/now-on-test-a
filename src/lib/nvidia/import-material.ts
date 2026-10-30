import type OpenAI from 'openai';
import { parseImportedMaterialJson } from '@/lib/import-material';
import type { ImportedMaterial, TargetLevel } from '@/types/ai-pipeline';
import { describeNvidiaError, resolveNvidiaModel } from './client';
import { GENERATE_SYSTEM_PROMPT, IMPORT_SYSTEM_PROMPT } from '@/lib/gemini/import-material';

export interface NvidiaImportImagePart {
  mimeType: string;
  data: string; // base64
}

const TIMEOUT_MS = 100_000;

function toDataUrl(mimeType: string, base64: string): string {
  return `data:${mimeType};base64,${base64}`;
}

function extractTextFromResponse(completion: unknown): string | undefined {
  const c = completion as { choices?: Array<{ message?: { content?: string } }> };
  return c.choices?.[0]?.message?.content ?? undefined;
}

/**
 * Nvidia Visionモデルで教材画像を構造化する。
 * OpenAI互換APIなので system プロンプトは message.role='system' で渡す。
 * 画像は data URI 形式の image_url で渡す（外部URL不要でアプリ内アップロードに対応）。
 */
export async function importMaterialWithNvidia(
  client: OpenAI,
  images: readonly NvidiaImportImagePart[],
): Promise<ImportedMaterial | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      ...images.map(
        (img) =>
          ({
            type: 'image_url' as const,
            image_url: { url: toDataUrl(img.mimeType, img.data) },
          }) as OpenAI.Chat.Completions.ChatCompletionContentPart,
      ),
      {
        type: 'text' as const,
        text: 'この現代文教材の画像から本文・傍線部・設問・選択肢を抽出し、正解判定とトラップ分類・スラッシュ分割を付与した構造化JSONを生成してください。出力はJSONのみ。コードフェンス不要。',
      },
    ];

    const completion = await client.chat.completions.create(
      {
        model: resolveNvidiaModel(),
        messages: [
          { role: 'system', content: IMPORT_SYSTEM_PROMPT },
          { role: 'user', content },
        ],
        temperature: 0.2,
        max_tokens: 16384,
        seed: 42,
        stream: false,
      } as never,
      { signal: controller.signal } as never,
    );

    return parseImportedMaterialJson(extractTextFromResponse(completion));
  } catch (e) {
    console.error('[nvidia/import-material] error:', describeNvidiaError(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateMaterialFromTextWithNvidia(
  client: OpenAI,
  rawText: string,
  targetLevel: TargetLevel,
): Promise<ImportedMaterial | null> {
  const LEVEL_INSTRUCTIONS: Record<TargetLevel, string> = {
    COMMON_TEST:
      '【共通テストレベル】本文の論理展開を素直に追えば解ける標準難度。誤答は局所的な矛盾・因果逆転など、傷が明快なものを中心に設計する。',
    MARCH:
      '【MARCH・関関同立レベル】段落をまたぐ対比構造の把握を要求する。誤答は一見もっともらしい概念のすり替え・言い過ぎを巧妙に混ぜる。',
    SOKEI:
      '【早慶レベル】極めて精緻な論理選別を要求する高難度。文末表現や修飾関係のわずかなズレを見抜かないと消去できない、2択で迷う誤答を作る。',
    NATIONAL_HARD:
      '【難関国公立レベル】本文全体の骨子（二項対立・弁証法的展開）の理解を問う。複数段落の要素を因果関係で結び直さないと正解できない設計にする。',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const completion = await client.chat.completions.create(
      {
        model: resolveNvidiaModel(),
        messages: [
          { role: 'system', content: GENERATE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `難易度: ${LEVEL_INSTRUCTIONS[targetLevel]}\n\n以下の文章から入試問題を作問してください。\n\n【入力テキスト】\n${rawText}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 16384,
        seed: 42,
        stream: false,
      } as never,
      { signal: controller.signal } as never,
    );
    return parseImportedMaterialJson(extractTextFromResponse(completion));
  } catch (e) {
    console.error('[nvidia/generate-material] error:', describeNvidiaError(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * どちらかが使える方で実行（Gemini優先、なければNvidia）。
 * 呼び出し側で両クライアントを渡す。
 */
export async function importMaterialWithEither(
  geminiClient: unknown | null,
  nvidiaClient: OpenAI | null,
  images: readonly NvidiaImportImagePart[],
  geminiImpl: (images: readonly { mimeType: string; data: string }[]) => Promise<ImportedMaterial | null>,
): Promise<{ material: ImportedMaterial | null; provider: 'gemini' | 'nvidia' | null }> {
  if (geminiClient) {
    try {
      const m = await geminiImpl(images as never);
      if (m) return { material: m, provider: 'gemini' };
    } catch {
      // fallback to nvidia
    }
  }
  if (nvidiaClient) {
    const m = await importMaterialWithNvidia(nvidiaClient, images);
    if (m) return { material: m, provider: 'nvidia' };
  }
  return { material: null, provider: null };
}
