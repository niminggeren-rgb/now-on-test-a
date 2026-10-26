import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Noto_Sans_JP, Noto_Serif_JP } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { cn } from '@/lib/utils';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
  preload: false,
});
const notoSerifJp = Noto_Serif_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-serif-jp',
  display: 'swap',
  preload: false,
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Logical Vernacular | 現代文論理攻略',
  description: '難関大現代文の論理的消去法トレーニング＆トラップ別弱点解析プラットフォーム',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ja"
      className={cn(inter.variable, notoSansJp.variable, notoSerifJp.variable, jetbrainsMono.variable)}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
