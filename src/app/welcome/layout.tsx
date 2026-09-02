import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/**
 * The one page that opts back into search indexing.
 *
 * The root layout sets `noindex` for the whole site, because everything else
 * is a company's private working data. This is the public front door, so it
 * is the only route that should ever appear in a search result.
 *
 * The page itself is a client component and cannot export metadata, hence a
 * layout here rather than a `metadata` export on the page.
 */
export const metadata: Metadata = {
  // Absolute, so the root layout's "%s · Flowline" template does not append
  // the brand to a title that already carries it.
  title: { absolute: 'Flowline — daily work, kept simple' },
  description:
    'One place for production planning, stock checks, sales visits, customer calls and daily entries — with an evening report that says exactly how the day went.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/welcome' },
}

export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return children
}
