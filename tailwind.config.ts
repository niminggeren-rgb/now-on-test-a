import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        surface: 'hsl(var(--surface))',
        border: 'hsl(var(--border))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        accent: 'hsl(var(--accent))',
        ring: 'hsl(var(--accent))',
        trap: {
          overstatement: 'hsl(var(--trap-overstatement))',
          causal: 'hsl(var(--trap-causal))',
          swap: 'hsl(var(--trap-swap))',
          unmentioned: 'hsl(var(--trap-unmentioned))',
          flip: 'hsl(var(--trap-flip))',
          partial: 'hsl(var(--trap-partial))',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'var(--font-noto-sans-jp)', 'sans-serif'],
        serif: ['var(--font-noto-serif-jp)', 'Yu Mincho', 'Hiragino Mincho ProN', 'serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      lineHeight: { passage: '2.1' },
      letterSpacing: { passage: '0.04em' },
    },
  },
  plugins: [animate],
};

export default config;
