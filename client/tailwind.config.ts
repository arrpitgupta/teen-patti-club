import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          950: '#04140d',
          900: '#072117',
          800: '#0b3322',
          700: '#0f4630',
          600: '#155c3f',
        },
        gold: {
          300: '#f5dc9a',
          400: '#ecc66a',
          500: '#d9a93f',
          600: '#b8872a',
        },
        ink: {
          100: '#f4f1ea',
          300: '#c9c4b8',
          500: '#8d897f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
      minHeight: { tap: '48px' },
      minWidth: { tap: '48px' },
    },
  },
  plugins: [],
} satisfies Config;
