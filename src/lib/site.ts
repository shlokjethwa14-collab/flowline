/** The canonical origin, with no trailing slash. */
export const SITE_URL = 'https://ckltask.com'

/**
 * Where this particular build is served from.
 *
 * Netlify sets `URL` on production deploys and `DEPLOY_PRIME_URL` on branch
 * and preview deploys. Preferring those means a preview build links to and
 * declares itself, rather than pointing search engines and Open Graph
 * scrapers at production with content that is not live yet.
 */
export function siteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.DEPLOY_PRIME_URL ?? process.env.URL ?? SITE_URL
  return fromEnv.replace(/\/$/, '')
}
