import type { Metadata } from 'next';
import { ExamAnalysisStudio } from '@/components/exam-analysis/exam-analysis-studio';

export const metadata: Metadata = { title: '模試W画像診断 | Logical Vernacular' };

export default function ExamAnalysisPage() {
  return <ExamAnalysisStudio />;
}
