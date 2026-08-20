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
        /* Driven by CSS variables and flipped end-for-end in `.dark`, so
           every existing zinc utility (text, bg, border, ring) becomes
           theme-aware without a single `dark:` variant in the components. */
        zinc: {
          50: 'hsl(var(--z-50) / <alpha-value>)',
          100: 'hsl(var(--z-100) / <alpha-value>)',
          200: 'hsl(var(--z-200) / <alpha-value>)',
          300: 'hsl(var(--z-300) / <alpha-value>)',
          400: 'hsl(var(--z-400) / <alpha-value>)',
          500: 'hsl(var(--z-500) / <alpha-value>)',
          600: 'hsl(var(--z-600) / <alpha-value>)',
          700: 'hsl(var(--z-700) / <alpha-value>)',
          800: 'hsl(var(--z-800) / <alpha-value>)',
          900: 'hsl(var(--z-900) / <alpha-value>)',
          950: 'hsl(var(--z-950) / <alpha-value>)',
        },
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
        '3xl': 'calc(var(--radius) + 18px)',
      },

      /* ------------------------------------------------------------ */
      /* Shadows — every tier carries the outer ring + specular pair,  */
      /* so a surface using these can never lose its edge cues.        */
      /* ------------------------------------------------------------ */
      boxShadow: {
        'glass-sm': [
          '0 0 0 0.5px hsl(225 20% 62% / 0.22)',
          '0 1px 1px hsl(225 30% 20% / 0.04)',
          '0 3px 8px -3px hsl(225 30% 20% / 0.09)',
          'inset 0 1px 0 rgb(255 255 255 / 0.96)',
          'inset 0 -1px 0 hsl(225 20% 70% / 0.18)',
        ].join(','),
        glass: [
          '0 0 0 0.5px hsl(225 20% 62% / 0.26)',
          '0 1px 1.5px hsl(225 30% 20% / 0.05)',
          '0 6px 16px -6px hsl(225 30% 20% / 0.1)',
          '0 22px 48px -18px hsl(225 30% 20% / 0.18)',
          'inset 0 1px 0 rgb(255 255 255 / 1)',
          'inset 0 -1px 0 hsl(225 20% 70% / 0.22)',
        ].join(','),
        'glass-lg': [
          '0 0 0 0.5px hsl(225 20% 62% / 0.3)',
          '0 1px 1.5px hsl(225 30% 20% / 0.05)',
          '0 8px 20px -8px hsl(225 30% 20% / 0.12)',
          '0 30px 64px -22px hsl(225 30% 20% / 0.22)',
          'inset 0 1.5px 0 rgb(255 255 255 / 1)',
          'inset 0 -14px 26px -20px hsl(225 30% 40% / 0.3)',
          'inset 0 -1px 0 hsl(225 20% 70% / 0.26)',
        ].join(','),
        /** A control sitting proud of its surface. */
        raised: [
          '0 0 0 0.5px hsl(225 20% 62% / 0.2)',
          '0 1px 1px hsl(225 30% 20% / 0.05)',
          '0 2px 6px -1px hsl(225 30% 20% / 0.1)',
          'inset 0 1px 0 rgb(255 255 255 / 1)',
          'inset 0 -1px 0 hsl(225 20% 70% / 0.2)',
        ].join(','),
        /** The same control pushed in. Light moves to the outside. */
        pressed: [
          'inset 0 2px 5px hsl(225 30% 25% / 0.16)',
          'inset 0 1px 0 hsl(225 30% 25% / 0.07)',
          '0 0 0 0.5px hsl(225 20% 62% / 0.24)',
        ].join(','),
        glow: ['0 0 0 1px hsl(250 84% 62% / 0.24)', '0 8px 28px -6px hsl(250 84% 62% / 0.4)'].join(','),
      },

      /* ------------------------------------------------------------ */
      /* Motion — Apple's curves.                                      */
      /* ------------------------------------------------------------ */
      transitionTimingFunction: {
        /** Large moves: sheets, dialogs, page transitions. */
        apple: 'cubic-bezier(0.32, 0.72, 0, 1)',
        /** Small, immediate feedback: buttons, toggles, chips. */
        'apple-snap': 'cubic-bezier(0.2, 0.9, 0.15, 1)',
        /** Exits — decelerates hard so things leave without lingering. */
        'apple-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        /** Slight overshoot, for things that "pop" into place. */
        'apple-pop': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        /** Alias kept so existing `ease-spring` usages read the new curve. */
        spring: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      transitionDuration: {
        fast: '140ms',
        base: '260ms',
        slow: '420ms',
        glass: '620ms',
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
        /** The house entrance: rises, settles, and firms up its edges. */
        'lift-in': {
          from: { opacity: '0', transform: 'translate3d(0,14px,0) scale(0.965)' },
          to: { opacity: '1', transform: 'translate3d(0,0,0) scale(1)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        /** Specular sweep — light travelling across a glass face. */
        specular: {
          '0%': { transform: 'translateX(-130%) skewX(-16deg)', opacity: '0' },
          '18%': { opacity: '1' },
          '82%': { opacity: '1' },
          '100%': { transform: 'translateX(260%) skewX(-16deg)', opacity: '0' },
        },
        /** Colour bloom behind an active control, breathing slowly. */
        bloom: {
          '0%,100%': { opacity: '0.55', transform: 'scale(0.98)' },
          '50%': { opacity: '0.9', transform: 'scale(1.04)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-8px) rotate(0.4deg)' },
        },
        /** Slow iridescent drift across a rim or fill. */
        iridesce: {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        /** Spring pop for checkboxes and toggles. */
        'pop-in': {
          '0%': { transform: 'scale(0.4)', opacity: '0' },
          '70%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down .24s cubic-bezier(0.32,0.72,0,1)',
        'accordion-up': 'accordion-up .24s cubic-bezier(0.32,0.72,0,1)',
        'lift-in': 'lift-in .62s cubic-bezier(0.32,0.72,0,1) both',
        'fade-in': 'fade-in .4s ease-out both',
        specular: 'specular 1.15s cubic-bezier(0.32,0.72,0,1)',
        bloom: 'bloom 4.5s ease-in-out infinite',
        float: 'float 9s ease-in-out infinite',
        iridesce: 'iridesce 12s ease-in-out infinite',
        shimmer: 'shimmer 1.7s infinite',
        'pop-in': 'pop-in .34s cubic-bezier(0.34,1.56,0.64,1) both',
      },
    },
  },
  plugins: [animate],
}

export default config
