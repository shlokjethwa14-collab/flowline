/**
 * Publishes `landing-out/` to the `gh-pages` branch and points GitHub Pages
 * at it.
 *
 *   node scripts/build-landing.mjs && node scripts/deploy-landing.mjs
 *
 * The branch holds only build output and shares no history with `main`, so
 * its commits never clutter the source history and a bad deploy can be
 * replaced wholesale. Each publish is a single fresh commit — there is no
 * value in a diff between two builds of the same page.
 *
 * Authentication comes from the GitHub CLI (`gh auth status`), so no token is
 * stored, printed or passed on a command line.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'landing-out')
const BRANCH = 'gh-pages'
const REPO = 'shlokjethwa14-collab/flowline'

/*
 * git runs without a shell so its arguments stay separate — with `shell:true`
 * on Windows they are concatenated into one string, and a commit message
 * containing a space or a newline is then parsed as further arguments.
 * `gh` is a .cmd wrapper on Windows and does need the shell.
 */
function git(args, options = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...options })
}
function gh(args, options = {}) {
  return execFileSync('gh', args, {
    cwd: ROOT,
    shell: process.platform === 'win32',
    encoding: 'utf8',
    ...options,
  })
}
function step(message) {
  console.warn(`\n[deploy] ${message}`)
}

if (!existsSync(join(OUT, 'index.html'))) {
  console.warn('landing-out/index.html is missing. Run: node scripts/build-landing.mjs')
  process.exit(1)
}

// --- Publish -------------------------------------------------------------
step(`pushing landing-out/ to ${BRANCH}`)

/*
 * `git subtree push` would need the output committed on main. Instead the
 * directory is turned into its own commit object with a temporary index, so
 * nothing about the working tree or main's history changes.
 */
const tmpIndex = join(ROOT, '.git', 'landing-index')
const env = { ...process.env, GIT_INDEX_FILE: tmpIndex }

const source = git(['rev-parse', '--short', 'HEAD']).trim()

try {
  git(['rm', '--cached', '-r', '--ignore-unmatch', '.'], { env })
} catch {
  // A fresh temporary index is already empty.
}

git(['--work-tree', 'landing-out', 'add', '-A', '-f'], { env })
const tree = git(['write-tree'], { env }).trim()
const commit = git(['commit-tree', tree, '-m', `Publish landing site from ${source}`], { env }).trim()

git(['push', '--force', 'origin', `${commit}:refs/heads/${BRANCH}`], { stdio: 'inherit' })

// --- Enable Pages --------------------------------------------------------
step('configuring GitHub Pages')

let pagesExists = true
try {
  gh(['api', `repos/${REPO}/pages`], { stdio: 'pipe' })
} catch {
  pagesExists = false
}

const method = pagesExists ? 'PUT' : 'POST'
console.warn(pagesExists ? '  Pages already enabled — updating source' : '  enabling Pages')
gh(
  ['api', '--method', method, `repos/${REPO}/pages`, '-f', `source[branch]=${BRANCH}`, '-f', 'source[path]=/'],
  { stdio: 'inherit' },
)

step('done')
console.warn(`  branch:  https://github.com/${REPO}/tree/${BRANCH}`)
console.warn(`  pages:   https://shlokjethwa14-collab.github.io/flowline/`)
console.warn(`  custom:  https://ckltask.com (once DNS points here)\n`)
