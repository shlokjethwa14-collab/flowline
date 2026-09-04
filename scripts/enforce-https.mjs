/**
 * Waits for GitHub to issue the TLS certificate for the custom domain, then
 * turns on HTTPS enforcement.
 *
 *   node scripts/enforce-https.mjs
 *
 * GitHub provisions a Let's Encrypt certificate only after the domain's DNS
 * has validated globally, which takes anywhere from a few minutes to a few
 * hours. Until then the API rejects `https_enforced` with "The certificate
 * does not exist yet", so this cannot simply be set at deploy time.
 *
 * Enforcement matters: without it the site answers plain HTTP, and a visitor
 * typing the bare domain gets an unencrypted page rather than a redirect.
 *
 * Safe to re-run. It exits as soon as enforcement is on.
 */
import { execFileSync } from 'node:child_process'

const REPO = 'shlokjethwa14-collab/flowline'
const DOMAIN = 'ckltask.com'

/** Poll for up to two hours; GitHub is usually done inside thirty minutes. */
const INTERVAL_MS = 60_000
const ATTEMPTS = 120

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function status() {
  return JSON.parse(gh(['api', `repos/${REPO}/pages`]))
}

const started = Date.now()

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  let pages
  try {
    pages = status()
  } catch (error) {
    console.warn(`[https] could not read Pages status: ${String(error).split('\n')[0]}`)
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
    continue
  }

  if (pages.https_enforced) {
    console.warn(`[https] enforced — https://${DOMAIN} is the canonical address`)
    process.exit(0)
  }

  const state = pages.https_certificate?.state ?? '(none yet)'
  const minutes = Math.round((Date.now() - started) / 60000)
  console.warn(`[https] attempt ${attempt}, ${minutes}m elapsed — certificate: ${state}`)

  if (state === 'approved') {
    try {
      gh(['api', '--method', 'PUT', `repos/${REPO}/pages`, '-F', 'https_enforced=true'])
      console.warn(`[https] enforcement enabled — https://${DOMAIN} now redirects from HTTP`)
      process.exit(0)
    } catch (error) {
      // Approved but not yet fully deployed to the edge; try again shortly.
      console.warn(`[https] not accepted yet: ${String(error).split('\n')[0]}`)
    }
  }

  await new Promise((r) => setTimeout(r, INTERVAL_MS))
}

console.warn(`[https] gave up after ${ATTEMPTS} attempts. Re-run this script; the certificate is still pending.`)
process.exitCode = 1
