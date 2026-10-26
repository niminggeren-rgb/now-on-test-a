import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { ShortcutHelpModal } from '@/components/layout/shortcut-help-modal';
import { TopBar } from '@/components/layout/top-bar';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  return (
    <div className="flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <TopBar connected={supabase !== null} />
        <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">{children}</main>
      </div>
      <ShortcutHelpModal />
    </div>
  );
}
