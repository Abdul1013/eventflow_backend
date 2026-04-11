import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#4F46E5', dark: '#3730A3' },
        accent: '#06B6D4',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)'    },
        },
      },
    },
  },
  safelist: [
    // @eventflow/ui Button — arbitrary hex values are not auto-detected by content scan
    'bg-[#4F46E5]', 'hover:bg-[#3730A3]',
    'bg-[#EF4444]', 'hover:bg-red-600',
    'text-[#4F46E5]', 'border-[#4F46E5]', 'hover:bg-indigo-50',
    'text-white', 'min-h-[44px]', 'inline-flex', 'focus-visible:ring-[#4F46E5]',
  ],
  plugins: [],
};

export default config;
