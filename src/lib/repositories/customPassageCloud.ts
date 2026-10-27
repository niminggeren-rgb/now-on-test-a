import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import {
  ImportedMaterialSchema,
  SourceTypeEnum,
  TargetLevelEnum,
} from '@/types/ai-pipeline';
import {
  customMaterialRepository,
  isUuid,
  type StoredCustomMaterial,
} from './customMaterialRepository';

/**
 * 取り込み・生成した教材の Supabase (`custom_passages`) 同期。
 * Supabase 未設定・未ログイン・通信失敗のときは何もせず、呼び出し側は localStorage だけで動き続ける。
 */

const rowSchema = z.object({
  id: z.string(),
  title: z.string(),
  author: z.string().nullable(),
  source_type: SourceTypeEnum,
  target_level: TargetLevelEnum,
  paragraphs: ImportedMaterialSchema.shape.paragraphs,
  underlines: ImportedMaterialSchema.shape.underlines,
  questions: ImportedMaterialSchema.shape.questions,
  metadata: z.object({ difficulty: ImportedMaterialSchema.shape.difficulty.optional() }).passthrough(),
  created_at: z.string(),
});

async function activeSession(): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  const supabase = createClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return data.user ? { supabase, userId: data.user.id } : null;
  } catch {
    return null;
  }
}

function toRow(userId: string, m: StoredCustomMaterial) {
  return {
    id: m.id,
    user_id: userId,
    title: m.title,
    author: m.author,
    source_type: m.sourceType ?? 'IMAGE_OCR',
    target_level: m.targetLevel ?? 'MARCH',
    paragraphs: m.paragraphs,
    underlines: m.underlines,
    questions: m.questions,
    metadata: { difficulty: m.difficulty },
    created_at: m.createdAt,
  };
}

function fromRow(raw: unknown): StoredCustomMaterial | null {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    id: r.id,
    createdAt: r.created_at,
    title: r.title,
    author: r.author ?? '出典不明',
    difficulty: r.metadata.difficulty ?? 'standard',
    sourceType: r.source_type,
    targetLevel: r.target_level,
    paragraphs: r.paragraphs,
    underlines: r.underlines,
    questions: r.questions,
  };
}

export const customPassageCloud = {
  /** 1件をクラウドへ保存（upsert）。保存できたら true */
  async push(material: StoredCustomMaterial): Promise<boolean> {
    if (!isUuid(material.id)) return false; // UUID 採番以前の旧データは端末内のみ
    const session = await activeSession();
    if (!session) return false;
    try {
      const { error } = await session.supabase
        .from('custom_passages')
        .upsert(toRow(session.userId, material), { onConflict: 'id' });
      return !error;
    } catch {
      return false;
    }
  },

  async remove(id: string): Promise<void> {
    if (!isUuid(id)) return;
    const session = await activeSession();
    if (!session) return;
    try {
      await session.supabase.from('custom_passages').delete().eq('id', id).eq('user_id', session.userId);
    } catch {
      // 端末内の削除は済んでいるので、クラウド側の失敗は無視する
    }
  },

  /** 自分の教材を新しい順に取得。取得できなければ null（空配列と区別する） */
  async list(): Promise<StoredCustomMaterial[] | null> {
    const session = await activeSession();
    if (!session) return null;
    try {
      const { data, error } = await session.supabase
        .from('custom_passages')
        .select('*')
        .eq('user_id', session.userId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error || !data) return null;
      return data.flatMap((row) => {
        const m = fromRow(row);
        return m ? [m] : [];
      });
    } catch {
      return null;
    }
  },

  async getById(id: string): Promise<StoredCustomMaterial | null> {
    if (!isUuid(id)) return null;
    const session = await activeSession();
    if (!session) return null;
    try {
      const { data, error } = await session.supabase.from('custom_passages').select('*').eq('id', id).maybeSingle();
      return error || !data ? null : fromRow(data);
    } catch {
      return null;
    }
  },

  /** 未ログイン中に端末へ溜めた教材を、ログイン後にクラウドへ移す。クラウド側の教材は端末へ取り込む。 */
  async sync(): Promise<StoredCustomMaterial[]> {
    const local = customMaterialRepository.getAllImportedMaterials();
    const remote = await this.list();
    if (remote === null) return local; // 未ログイン等
    const remoteIds = new Set(remote.map((m) => m.id));
    await Promise.all(local.filter((m) => !remoteIds.has(m.id)).map((m) => this.push(m)));
    return customMaterialRepository.mergeImportedMaterials(remote);
  },

  /** 端末にあればそれを、無ければクラウドから取得して端末に保存する（別端末で作った教材を開く経路） */
  async resolve(id: string): Promise<StoredCustomMaterial | null> {
    const local = customMaterialRepository.getImportedMaterialById(id);
    if (local) return local;
    const remote = await this.getById(id);
    if (remote) customMaterialRepository.mergeImportedMaterials([remote]);
    return remote;
  },
};
