import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type AppMode = 'supabase' | 'hybrid';

export function getAppMode(): AppMode {
  return process.env.NEXT_PUBLIC_APP_MODE === 'supabase' ? 'supabase' : 'hybrid';
}
