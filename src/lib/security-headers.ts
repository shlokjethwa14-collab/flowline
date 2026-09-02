import { SUPABASE_URL } from './supabase/env'

/**
 * Security headers applied to every response by the middleware.
 *
 * These are set in code rather than in netlify.toml on purpose: the Content
 * Security Policy needs a fresh nonce per request, which a static host config
 * cannot produce. Keeping the whole set together means there is one place to
 * read to know what protects the site.
 */

/** Cryptographically random, base64. One per request — never reused. */
export function createNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

/**
 * Builds the CSP for one request.
 *
 * `'strict-dynamic'` is what makes this workable with Next: the framework
 * injects its own scripts at runtime, and enumerating them is impossible.
 * With strict-dynamic, a script the browser trusts (because it carries our
 * nonce) may load further scripts, and the host list is ignored by browsers
 * that understand it. `https:` stays in the list purely as a fallback for
 * older browsers that do not.
 *
 * `'unsafe-inline'` for styles is deliberate and unavoidable: Next inlines
 * critical CSS, and Motion writes inline styles on every animated element —
 * that is how the whole animation layer works. A style-src nonce would break
 * both. Style injection is a far smaller risk than script injection.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const supabaseOrigin = SUPABASE_URL ? new URL(SUPABASE_URL).origin : ''
  const supabaseSocket = supabaseOrigin.replace(/^https:/, 'wss:')

  const connect = [
    "'self'",
    supabaseOrigin,
    // Supabase Realtime is a WebSocket to the same project.
    supabaseSocket,
    // Next's dev server talks to itself over ws for hot reload.
    isDev ? 'ws://localhost:*' : '',
  ].filter(Boolean)

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // eval is required by Next's dev compiler and by nothing in production.
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      'https:',
      isDev ? "'unsafe-eval'" : '',
    ].filter(Boolean),
    'style-src': ["'self'", "'unsafe-inline'"],
    // blob: covers the canvas textures three.js generates at runtime.
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': connect,
    'worker-src': ["'self'", 'blob:'],
    'media-src': ["'self'"],
    // Nothing in Flowline embeds anything, and nothing may embed Flowline.
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  }

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')

  // Only meaningful over HTTPS, and it would break local http development.
  return isDev ? policy : `${policy}; upgrade-insecure-requests`
}

/**
 * Everything that does not vary per request.
 *
 * HSTS is deliberately absent here and set at the edge instead — see
 * netlify.toml. A max-age this long is effectively irreversible for the
 * domain, so it belongs somewhere it is unmistakable rather than buried in
 * application code.
 */
export const STATIC_SECURITY_HEADERS: Record<string, string> = {
  // Stops a browser second-guessing a Content-Type, which is how a stored
  // .txt upload becomes a stored XSS.
  'X-Content-Type-Options': 'nosniff',
  // frame-ancestors above supersedes this; kept for browsers predating CSP 2.
  'X-Frame-Options': 'DENY',
  // Send the full URL within the site, only the origin when leaving it — so
  // a task id never leaks to a third party in a Referer header.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Flowline records calls, so it asks for the microphone — from its own
  // origin only, and nothing else is available to anyone.
  'Permissions-Policy': [
    'microphone=(self)',
    'camera=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'interest-cohort=()',
  ].join(', '),
  // Isolates this origin from cross-origin popups it opens.
  'Cross-Origin-Opener-Policy': 'same-origin',
}
