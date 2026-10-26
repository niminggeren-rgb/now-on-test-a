import { PhasePlaceholder } from '@/components/layout/phase-placeholder';

export default async function Page({ params }: { params: Promise<{ passageId: string }> }) {
  const { passageId } = await params;
  return (
    <PhasePlaceholder
      title={`演習: ${passageId}`}
      phase={3}
      summary="本文リーダーと論理消去UIのスプリットビューを提供します。"
    />
  );
}
