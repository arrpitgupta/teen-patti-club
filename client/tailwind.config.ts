import type { Config } from 'tailwindcss';

// "Midnight Felt" tokens. Gold is only for the pot, the player to act and your turn.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          950: '#04140D',
          900: '#072117',
          850: '#0B2419',
          800: '#0B3322',
          700: '#0F4630',
          600: '#155C3F',
        },
        panel: { DEFAULT: '#0F2E20', raised: '#133A28', sunk: '#0B2419' },
        rail: { DEFAULT: '#2A1A0F', light: '#3A2414', line: '#5A3A22' },
        gold: { 300: '#F5DC9A', 400: '#ECC66A', 500: '#D9A93F', 600: '#B8872A', ink: '#1A1206' },
        ink: { 100: '#F4F1EA', 300: '#C9C4B8', 500: '#8D897F' },
        card: { face: '#FBF8F1', red: '#C8102E', black: '#17171A', back: '#5B1220' },
        suit: { red: '#FF7A85' },
        overdue: '#FF9F43',
        up: '#6EE7B7',
        down: '#FF8A80',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      minHeight: { tap: '48px' },
      minWidth: { tap: '48px' },
      boxShadow: {
        turn: '0 0 0 3px #ECC66A, 0 0 24px 6px rgba(236,198,106,0.5)',
        overdue: '0 0 0 3px #0B3322, 0 0 0 6px #FF9F43, 0 0 28px 8px rgba(255,159,67,0.45)',
        dock: '0 -1px 0 #ECC66A, 0 -16px 36px rgba(236,198,106,0.22)',
        sheet: '0 -12px 40px rgba(0,0,0,0.5)',
        card: '0 8px 18px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
} satisfies Config;
