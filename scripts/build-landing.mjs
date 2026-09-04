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
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORKTREE = join(ROOT, '.landing-build')
const OUT = join(ROOT, 'landing-out')

const DOMAIN = 'ckltask.com'

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
  'src/middleware.ts',
  'src/app/api',
  'src/app/(app)',
  'src/app/auth',
  'src/app/login',
  // Generated at request time from Netlify's env; the landing build writes
  // its own robots.txt below.
  'src/app/robots.ts',
  'src/app/sitemap.ts',
  // These three are route handlers. Under `output: 'export'` each would need
  // an explicit `dynamic = "force-static"`, and the app build wants them
  // dynamic — so the landing build writes them as plain files instead.
  'src/app/manifest.ts',
]) {
  rmSync(join(WORKTREE, path), { recursive: true, force: true })
}

// The root page redirects into the app, which does not exist in this build.
// Serve the landing story at `/` instead, so ckltask.com works with no path.
writeFileSync(
  join(WORKTREE, 'src/app/page.tsx'),
  `export { default } from './welcome/page'\nexport { metadata } from './welcome/layout'\n`,
  'utf8',
)

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
execFileSync('npx', ['next', 'build'], {
  cwd: WORKTREE,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, NEXT_PUBLIC_STATIC_EXPORT: '1', NEXT_PUBLIC_SITE_URL: `https://${DOMAIN}` },
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
