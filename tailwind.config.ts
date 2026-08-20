import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 10px)',
      },
      boxShadow: {
        'glass-sm': '0 1px 2px rgba(24,24,27,.05), 0 1px 1px rgba(24,24,27,.04), inset 0 1px 0 rgba(255,255,255,.7)',
        glass:
          '0 1px 2px rgba(24,24,27,.06), 0 4px 12px -2px rgba(24,24,27,.07), 0 12px 32px -8px rgba(24,24,27,.10), inset 0 1px 0 rgba(255,255,255,.8)',
        'glass-lg':
          '0 2px 4px rgba(24,24,27,.05), 0 10px 24px -6px rgba(24,24,27,.10), 0 28px 64px -16px rgba(24,24,27,.16), inset 0 1px 0 rgba(255,255,255,.85)',
        raised:
          '0 1px 1px rgba(24,24,27,.05), 0 2px 6px -1px rgba(24,24,27,.09), inset 0 1px 0 rgba(255,255,255,.9), inset 0 -1px 0 rgba(24,24,27,.05)',
        pressed: 'inset 0 2px 5px rgba(24,24,27,.14), inset 0 1px 0 rgba(24,24,27,.06)',
        glow: '0 0 0 1px rgba(124,108,246,.22), 0 8px 28px -6px rgba(124,108,246,.35)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translate3d(0,10px,0) scale(.985)' },
          to: { opacity: '1', transform: 'translate3d(0,0,0) scale(1)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        sheen: {
          '0%': { transform: 'translateX(-120%) skewX(-18deg)' },
          '100%': { transform: 'translateX(240%) skewX(-18deg)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down .2s ease-out',
        'accordion-up': 'accordion-up .2s ease-out',
        'rise-in': 'rise-in .5s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .4s ease-out both',
        sheen: 'sheen 1.1s cubic-bezier(.4,0,.2,1)',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(.22,1,.36,1)',
        glide: 'cubic-bezier(.4,0,.2,1)',
      },
    },
  },
  plugins: [animate],
}

export default config
