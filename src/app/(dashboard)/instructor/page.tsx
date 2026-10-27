import { ExamCartePanel } from '@/components/exam-analysis/exam-carte-panel';
import { StudentCarteView } from '@/components/instructor/student-carte-view';

// 認証・組織連携が入るまで、担当生徒は未登録（架空のデモ生徒は表示しない）。
// 上部の模試診断パネルは、この端末で実行した W画像解析の実記録だけを表示する。
export default function InstructorPage() {
  return (
    <>
      <ExamCartePanel />
      <StudentCarteView students={[]} />
    </>
  );
}
