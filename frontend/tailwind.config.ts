import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Backgrounds — neutral dark system
        'bg-base':      '#09090B',
        'bg-surface':   '#111113',
        'bg-elevated':  '#1C1C1F',
        'bg-secondary': '#1C1C1F',
        'bg-tertiary':  '#27272B',
        'bg-overlay':   '#2E2E33',
        // Borders
        'border-subtle':  '#27272B',
        'border-default': '#3F3F46',
        // Text hierarchy
        'text-primary':    '#FAFAFA',
        'text-secondary':  '#A1A1AA',
        'text-muted':      '#71717A',
        'text-quaternary': '#3F3F46',
        // System accent colors
        'accent-blue':   '#3B82F6',
        'accent-green':  '#22C55E',
        'accent-red':    '#EF4444',
        'accent-amber':  '#F59E0B',
        'accent-purple': '#A855F7',
        'accent-teal':   '#14B8A6',
        'accent-pink':   '#EC4899',
        'accent-yellow': '#EAB308',
        // Primary = orange
        'primary':       '#F97316',
        'primary-light': '#FB923C',
        'primary-glow':  'rgba(249,115,22,0.35)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        'xxs':  ['13px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        'xs':   ['14px', { lineHeight: '1.4' }],
        'sm':   ['15px', { lineHeight: '1.5' }],
        'base': ['16px', { lineHeight: '1.6' }],
        'lg':   ['18px', { lineHeight: '1.4' }],
        'xl':   ['21px', { lineHeight: '1.3', fontWeight: '600' }],
        '2xl':  ['26px', { lineHeight: '1.25', fontWeight: '700' }],
        '3xl':  ['32px', { lineHeight: '1.2',  fontWeight: '700' }],
        '4xl':  ['38px', { lineHeight: '1.1',  fontWeight: '700' }],
      },
      borderRadius: {
        'xs':   '6px',
        'sm':   '8px',
        'md':   '10px',
        'lg':   '12px',
        'xl':   '14px',
        '2xl':  '16px',
        '3xl':  '20px',
        'card': '16px',
        'full': '9999px',
      },
      boxShadow: {
        'card':       '0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.25)',
        'card-hover': '0 4px 24px rgba(0,0,0,0.5)',
        'nav':        '0 8px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        'primary':    '0 4px 20px rgba(249,115,22,0.4)',
        'primary-lg': '0 8px 32px rgba(249,115,22,0.5)',
      },
      spacing: {
        '18': '72px',
        '22': '88px',
        'safe': 'env(safe-area-inset-bottom)',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        scaleIn: { from: { transform: 'scale(0.95)', opacity: '0' }, to: { transform: 'scale(1)', opacity: '1' } },
      },
      animation: {
        'fade-in':  'fadeIn 0.18s ease',
        'slide-up': 'slideUp 0.28s cubic-bezier(0.32,0.72,0,1)',
        'scale-in': 'scaleIn 0.2s ease',
      },
    },
  },
  plugins: [],
} satisfies Config
