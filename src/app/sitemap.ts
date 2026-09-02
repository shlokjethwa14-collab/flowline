import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/** One public page, so one entry. Everything else needs a sign-in. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl()}/welcome`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
  ]
}
