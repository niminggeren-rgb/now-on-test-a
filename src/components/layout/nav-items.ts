import { BarChart3, Camera, ScanSearch, FileText, GraduationCap, LayoutDashboard, PenLine, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'ダッシュボード', description: '弱点分析', icon: LayoutDashboard },
  { href: '/practice', label: '論理演習', description: '消去法トレーニング', icon: FileText },
  { href: '/descriptive', label: '400字記述', description: 'AI添削', icon: PenLine },
  { href: '/import', label: '教材インジェクター', description: '貼り付け・撮影で問題化', icon: Camera },
  { href: '/exam-analysis', label: '模試W画像診断', description: '問題＋答案を照合', icon: ScanSearch },
  { href: '/mock-exams', label: '模試・答案解析', description: '得点推移', icon: BarChart3 },
  { href: '/instructor', label: '講師カルテ', description: '生徒管理', icon: GraduationCap },
];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV_ITEMS[0];
  return NAV_ITEMS.slice(1).find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
