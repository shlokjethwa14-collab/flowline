import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { QueryProvider } from '@/components/providers/query-provider'
import { ThemeProvider, THEME_INIT_SCRIPT } from '@/components/providers/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

/**
 * True only in the static landing build, which has no Node server behind it.
 * Read at module scope so the check is compiled away rather than evaluated
 * per render.
 */
const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === '1'

const DESCRIPTION =
  'A calm internal task manager for production, sales and daily operations teams. Assign the work, see the day, close the day.'

/**
 * Absolute URLs are built from this, so Open Graph tags resolve correctly
 * when a link is pasted into WhatsApp or Slack. Netlify sets URL on every
 * deploy, which keeps preview builds pointing at themselves rather than at
 * production.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.URL ?? 'https://ckltask.com'),
  title: {
    default: 'Flowline — daily work, kept simple',
    template: '%s · Flowline',
  },
  description: DESCRIPTION,
  applicationName: 'Flowline',
  /*
   * Nothing is indexed by default. Flowline is a company's internal tool, and
   * a task title has no business appearing in a search result. The public
   * landing page opts back in for itself — see src/app/welcome/page.tsx.
   */
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    siteName: 'Flowline',
    title: 'Flowline — daily work, kept simple',
    description: DESCRIPTION,
    url: '/welcome',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Flowline' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Flowline — daily work, kept simple',
    description: DESCRIPTION,
    images: ['/og.png'],
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  // Matches the two theme backgrounds, so the mobile browser chrome does not
  // sit in a light bar above a dark page.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a11' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  /*
   * The middleware mints one nonce per request and forwards it here. Without
   * it the Content Security Policy blocks the theme script below, and every
   * load flashes the wrong theme before hydration corrects it.
   *
   * The static landing build has no server and therefore no per-request
   * nonce, and calling headers() there fails the export outright. That build
   * gets its CSP from a meta tag instead — see scripts/build-landing.mjs.
   */
  const nonce = STATIC_EXPORT ? undefined : ((await headers()).get('x-nonce') ?? undefined)

  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets the theme class before first paint — no flash of the wrong
            theme on load or on a hard refresh. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <QueryProvider>
            <TooltipProvider delayDuration={220} skipDelayDuration={280}>
              {children}
              <Toaster />
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
