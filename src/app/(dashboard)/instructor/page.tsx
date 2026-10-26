import { ExamCartePanel } from '@/components/exam-analysis/exam-carte-panel';
import { StudentCarteView } from '@/components/instructor/student-carte-view';
import { MOCK_STUDENTS } from '@/lib/mock-data/students';

// 生徒カルテは現時点ではデモ用の架空データのみ（認証・組織連携は未実装）。
// 上部の模試診断パネルは、この端末で実行した W画像解析の実記録を表示する。
export default function InstructorPage() {
  return (
    <>
      <ExamCartePanel />
      <StudentCarteView students={MOCK_STUDENTS} />
    </>
  );
}
