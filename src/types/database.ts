import type { TargetTier, UserRole } from '@/types/domain';

/**
 * Supabase の行型（snake_case）。supabase/schema.sql と対応する。
 * Phase 2 以降で必要になるテーブルを追加していく。
 */
export interface ProfileRow {
  id: string;
  organization_id: string | null;
  display_name: string;
  role: UserRole;
  grade: string;
  target_tier: TargetTier;
  target_universities: string[];
  preferred_writing_mode: 'horizontal' | 'vertical';
  streak_days: number;
  last_practiced_at: string | null;
  created_at: string;
  updated_at: string;
}
