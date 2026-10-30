import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

// Google Fonts はビルド時に fonts.googleapis.com へのネットワークを要するため、
// オフライン/Vercelのネットワーク制限などで "Load failed" / `Failed to fetch Inter` でビルドが落ちる。
// システムフォントにフォールバックしつつ、CSS変数は空で定義して tailwind.config.ts の fontFamily が壊れないようにする。
const inter = { variable: '--font-inter' } as const;
const notoSansJp = { variable: '--font-noto-sans-jp' } as const;
const notoSerifJp = { variable: '--font-noto-serif-jp' } as const;
const jetbrainsMono = { variable: '--font-jetbrains-mono' } as const;

export const metadata: Metadata = {
  title: 'Logical Vernacular | 現代文論理攻略',
  description: '難関大現代文の論理的消去法トレーニング＆トラップ別弱点解析プラットフォーム',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ja"
      className={[inter.variable, notoSansJp.variable, notoSerifJp.variable, jetbrainsMono.variable].join(' ')}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
