import type { MockExamRecord, TargetTier, TrapWeaknessStat } from '@/types/domain';

export interface DescriptiveAttemptRecord {
  id: string;
  date: string; // YYYY-MM-DD
  passageTitle: string;
  promptSummary: string;
  score: number;
  answerExcerpt: string;
  aiFeedback: string;
  rubric: { element: string; earned: number; max: number }[];
}

export interface InstructorComment {
  id: string;
  studentId: string;
  /** 特定の記述答案へのコメントなら、その答案ID。全体コメントは null */
  attemptId: string | null;
  text: string;
  createdAt: string; // ISO 8601
}

export interface StudentRecord {
  id: string;
  name: string;
  grade: string;
  targetUniversity: string;
  targetTier: TargetTier;
  streakDays: number;
  /** 選択問題の正答率 (%) */
  accuracy: number;
  /** 平均解答時間（秒/問） */
  avgSeconds: number;
  stats: TrapWeaknessStat[];
  exams: MockExamRecord[];
  descriptiveAttempts: DescriptiveAttemptRecord[];
  seedComments: InstructorComment[];
}
