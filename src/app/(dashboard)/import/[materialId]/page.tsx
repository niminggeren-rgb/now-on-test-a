import type { Metadata } from 'next';
import { CustomMaterialPlayer } from '@/components/import/custom-material-player';

export const metadata: Metadata = { title: 'マイ教材で演習 | Logical Vernacular' };

export default async function CustomMaterialPage({ params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = await params;
  return <CustomMaterialPlayer materialId={materialId} />;
}
