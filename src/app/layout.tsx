import type { Metadata, Viewport } from 'next'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { ReactNode } from 'react'
import { QueryProvider } from '@/components/providers/query-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Flowline',
    template: '%s · Flowline',
  },
  description:
    'A calm internal task manager for production, sales and daily operations teams. Assign the work, see the day, close the day.',
  applicationName: 'Flowline',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <QueryProvider>
          <TooltipProvider delayDuration={220} skipDelayDuration={280}>
            {children}
            <Toaster />
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  )
}
