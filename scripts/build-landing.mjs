/**
 * Builds the public landing page as a static site for GitHub Pages.
 *
 * Why this exists
 * ---------------
 * Flowline proper needs a Node server: middleware refreshes the Supabase
 * session on every request, `/api/*` handles the AI calls, and the auth
 * callback runs server-side. GitHub Pages serves static files only, so the
 * app cannot live there. The landing story can — it is a client-rendered
 * page with no server dependency at all.
 *
 * This produces that one page, so ckltask.com resolves to something real
 * while the application waits on a Node host.
 *
 * How it works
 * ------------
 * The build happens in a throwaway git worktree, never in your working tree.
 * That matters: producing a static export means deleting the middleware and
 * every server route, and doing that in place would leave the repository in a
 * broken state if the build failed halfway. The worktree is a detached
 * checkout of HEAD that gets mutated freely and then discarded.
 *
 *   node scripts/build-landing.mjs
 *
 * Output lands in `landing-out/`.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORKTREE = join(ROOT, '.landing-build')
const OUT = join(ROOT, 'landing-out')

const DOMAIN = 'ckltask.com'

/** The live project. Both values are safe in a browser — see the build step. */
const SUPABASE_URL = 'https://zpurdgofmiyveqfiulbq.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_h6cq2IvZMSyPS3NMjrey7w_e6RiHrmK'

function run(command, args, cwd = ROOT) {
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
}

function step(message) {
  console.warn(`\n[landing] ${message}`)
}

// --- 1. A clean worktree -----------------------------------------------
step('preparing an isolated worktree')

/*
 * Clean up whatever a previous run left behind. `prune` is the important
 * part and runs unconditionally: deleting the directory does not remove
 * git's record of the worktree, and a stale record makes the next `add`
 * fail with "already exists" even though nothing is there.
 */
function clearWorktree() {
  if (existsSync(WORKTREE)) {
    try {
      run('git', ['worktree', 'remove', '--force', '.landing-build'])
    } catch {
      rmSync(WORKTREE, { recursive: true, force: true })
    }
  }
  try {
    run('git', ['worktree', 'prune'])
  } catch {
    // Nothing to prune.
  }
}

clearWorktree()
run('git', ['worktree', 'add', '--detach', '--force', '.landing-build', 'HEAD'])

/*
 * No node_modules is installed or linked into the worktree, deliberately.
 *
 * The worktree sits inside the repository, so Node's resolution algorithm
 * walks up and finds the parent's node_modules on its own. Linking it
 * instead fails: Turbopack treats the worktree as the filesystem root and
 * rejects a symlink whose target lies outside it. Copying it would mean
 * duplicating tens of thousands of files for every build.
 */

// --- 2. Strip everything that needs a server ----------------------------
step('removing server-only routes')

/*
 * `output: 'export'` refuses to build at all if middleware exists, and fails
 * on any route handler that is not statically resolvable. None of these are
 * reachable from the landing page, so removing them changes nothing about
 * what is shipped — it only makes the export legal.
 */
for (const path of [
  // Middleware cannot exist at all under `output: 'export'` — the build
  // refuses outright. Its job here was refreshing the Supabase session and
  // redirecting signed-out visitors; supabase-js refreshes its own token in
  // the browser, and the redirect moves into the app layout below.
  'src/middleware.ts',
  // Every /api route needs a server-side secret (the Anthropic key, or the
  // Supabase service role) and so cannot move into the browser. The three
  // features that call them fail with a plain sentence — see needsServer()
  // in src/lib/data/api.ts.
  'src/app/api',
  // Route handlers. Under `output: 'export'` each would need an explicit
  // `dynamic = "force-static"`, and the hosted build wants them dynamic — so
  // this build writes them as plain files instead.
  'src/app/robots.ts',
  'src/app/sitemap.ts',
  'src/app/manifest.ts',
]) {
  rmSync(join(WORKTREE, path), { recursive: true, force: true })
}

/*
 * Swap the three server pieces for client-side equivalents.
 *
 * These live as real .tsx files under scripts/static/ rather than as strings
 * in here, so they are type-checked and linted like the rest of the codebase
 * instead of silently rotting inside a template literal.
 */
for (const [source, target] of [
  ['auth-callback-page.tsx', 'src/app/auth/callback/page.tsx'],
  ['sign-out-page.tsx', 'src/app/auth/sign-out/page.tsx'],
  ['app-layout.tsx', 'src/app/(app)/layout.tsx'],
]) {
  cpSync(join(ROOT, 'scripts', 'static', source), join(WORKTREE, target))
}
rmSync(join(WORKTREE, 'src/app/auth/callback/route.ts'), { force: true })
rmSync(join(WORKTREE, 'src/app/auth/sign-out/route.ts'), { force: true })

/*
 * Security headers, as far as a static host allows.
 *
 * GitHub Pages serves fixed headers and cannot be configured, so the
 * middleware's set cannot be reproduced. Of those, only the Content Security
 * Policy also works as a meta tag, so that is what goes in. It is weaker than
 * the served one — a meta CSP cannot carry a per-request nonce, cannot set
 * frame-ancestors, and is applied only after the parser reaches it.
 *
 * What is lost, and why it is survivable here: X-Frame-Options and
 * frame-ancestors (clickjacking), which matters less for a site whose every
 * action needs a signed-in session; Referrer-Policy, though GitHub Pages sends
 * a same-origin default; and HSTS, which GitHub sets itself on Pages domains.
 *
 * The real protection has never been in these headers. Every row is decided
 * by row level security inside Postgres against the caller's own token.
 */
const layoutPath = join(WORKTREE, 'src/app/layout.tsx')
const layout = readFileSync(layoutPath, 'utf8')
const metaCsp = `        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ${SUPABASE_URL} ${SUPABASE_URL.replace('https:', 'wss:')}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'"
        />
`
writeFileSync(layoutPath, layout.replace('      <head>\n', `      <head>\n${metaCsp}`), 'utf8')

// --- 3. Export configuration -------------------------------------------
step('writing the export config')

/*
 * A static host cannot set headers, so the Content Security Policy travels in
 * a meta tag instead. It is necessarily weaker than the middleware's: there
 * is no per-request nonce, so inline scripts are permitted by hash-less
 * 'unsafe-inline'. GitHub Pages sets HSTS and the transport security itself.
 *
 * Image optimisation is disabled because it is a server feature; the story
 * photographs are already sized and compressed by
 * scripts/optimise-story-images.mjs.
 */
writeFileSync(
  join(WORKTREE, 'next.config.mjs'),
  `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  /*
   * Turbopack decides the workspace root by finding the nearest lockfile,
   * which in a worktree is the worktree itself — and then refuses to compile
   * the parent's node_modules because it sits outside that root. Naming the
   * real repository root fixes the resolution without copying anything.
   */
  turbopack: { root: ${JSON.stringify(ROOT)} },
}

export default nextConfig
`,
  'utf8',
)

// --- 4. Build ------------------------------------------------------------
step('building')
/*
 * The Supabase URL and publishable key are baked into the bundle. That is by
 * design, not an oversight: this key is meant to be public, and every request
 * it makes is still judged by row level security against the signed-in user's
 * own token. The service role key is the secret one, and it is never present
 * in a browser build.
 */
execFileSync('npx', ['next', 'build'], {
  cwd: WORKTREE,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NEXT_PUBLIC_STATIC_EXPORT: '1',
    NEXT_PUBLIC_SITE_URL: `https://${DOMAIN}`,
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_PUBLISHABLE_KEY,
  },
})

// --- 5. Collect the output ----------------------------------------------
step('collecting output')

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
cpSync(join(WORKTREE, 'out'), OUT, { recursive: true })

// Tells GitHub Pages which domain to serve, and to keep its Jekyll processor
// away from the `_next` directory — without this, every asset 404s.
writeFileSync(join(OUT, 'CNAME'), `${DOMAIN}\n`, 'utf8')
writeFileSync(join(OUT, '.nojekyll'), '', 'utf8')

/*
 * The landing page's "Sign in" and "See the demo" buttons point into the
 * application, which is not part of this build and has no host yet. Left
 * alone they 404, which is worse than saying so.
 *
 * This placeholder is deliberately plain and dependency-free — it is
 * temporary, and it disappears the moment the real app is deployed to a Node
 * host, because /login is then served by the app itself.
 */
const placeholder = (heading, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading} · Flowline</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
  :root { color-scheme: light dark; --bg:#ffffff; --fg:#18181b; --muted:#71717a; --line:#e4e4e7; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0a0a11; --fg:#fafafa; --muted:#a1a1aa; --line:#27272a; }
  }
  * { box-sizing: border-box; }
  body {
    margin:0; min-height:100dvh; display:grid; place-items:center; padding:24px;
    background:var(--bg); color:var(--fg);
    font:400 16px/1.6 ui-sans-serif,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;
  }
  main { max-width:30rem; text-align:center; }
  .mark {
    width:52px; height:52px; margin:0 auto 22px; border-radius:15px;
    background:linear-gradient(135deg,#8b7bf5,#6d58f0);
    display:grid; place-items:center;
    box-shadow:0 8px 24px -8px rgba(109,88,240,.7);
  }
  h1 { font-size:1.5rem; font-weight:600; letter-spacing:-.02em; margin:0 0 12px; }
  p { color:var(--muted); margin:0 0 28px; text-wrap:pretty; }
  a {
    display:inline-block; padding:11px 20px; border-radius:999px;
    border:1px solid var(--line); color:var(--fg); text-decoration:none; font-weight:500; font-size:14px;
  }
  a:hover { border-color:var(--muted); }
</style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1"/>
        <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1"/>
        <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1"/>
      </svg>
    </div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <a href="/">Back to the front page</a>
  </main>
</body>
</html>
`

/*
 * A single-page-app fallback. GitHub Pages serves 404.html for any path it
 * does not recognise; pointing that at the app's own not-found page keeps a
 * mistyped URL on-brand instead of showing GitHub's default.
 */
mkdirSync(join(OUT, 'not-found'), { recursive: true })
writeFileSync(
  join(OUT, 'not-found', 'index.html'),
  placeholder('Page not found', 'That address does not exist. The front page has everything.'),
  'utf8',
)

writeFileSync(
  join(OUT, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'Flowline',
      short_name: 'Flowline',
      description: 'Daily work, kept simple.',
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#6d58f0',
      icons: [
        { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  ),
  'utf8',
)

writeFileSync(
  join(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: https://${DOMAIN}/sitemap.xml\n`,
  'utf8',
)
writeFileSync(
  join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://${DOMAIN}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
`,
  'utf8',
)

// --- 6. Clean up ---------------------------------------------------------
step('removing the worktree')
clearWorktree()

console.warn(`\n[landing] done — static site in landing-out/\n`)
