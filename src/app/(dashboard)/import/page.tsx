import type { Metadata } from 'next';
import { ImportStudio } from '@/components/import/import-studio';

export const metadata: Metadata = { title: '教材カメラ取り込み | Logical Vernacular' };

export default function ImportPage() {
  return <ImportStudio />;
}
