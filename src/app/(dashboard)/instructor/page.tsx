import { StudentCarteView } from '@/components/instructor/student-carte-view';
import { MOCK_STUDENTS } from '@/lib/mock-data/students';

// 現時点では、デモ用の架空の生徒データのみを表示する（認証・組織連携は未実装）。
export default function InstructorPage() {
  return <StudentCarteView students={MOCK_STUDENTS} />;
}
