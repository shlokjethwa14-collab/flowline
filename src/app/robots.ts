import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/**
 * Only the landing page is crawlable.
 *
 * Everything else is one company's live operational data — task titles,
 * customer names, call notes. None of it belongs in a search index, and the
 * routes are behind authentication anyway; this simply stops crawlers
 * wasting requests on redirects to the sign-in page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/welcome'],
        disallow: '/',
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  }
}
