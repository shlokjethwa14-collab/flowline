/**
 * Checks that ckltask.com is wired up correctly, end to end.
 *
 * Run it after changing DNS and again after the certificate appears. It
 * answers the questions that are otherwise guesswork during a domain move:
 * whether the nameservers have actually changed hands, whether the apex still
 * points at the registrar's parking page, whether HTTPS is being enforced,
 * and whether the security headers the middleware sets are surviving the trip
 * through the host.
 *
 *   node scripts/check-domain.mjs
 *   node scripts/check-domain.mjs staging.example.com
 */
import { Resolver } from 'node:dns/promises'

const domain = process.argv[2] ?? 'ckltask.com'

/** Netlify's documented apex load balancer. */
const NETLIFY_APEX_IP = '75.2.60.5'

/* Query a public resolver rather than the machine's own. A local or ISP
 * resolver can hold a stale answer for hours, which during a domain move is
 * exactly the thing being investigated. */
const resolver = new Resolver()
resolver.setServers(['8.8.8.8', '1.1.1.1'])

let failures = 0
let warnings = 0

function pass(label, detail = '') {
  console.warn(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
}
function warn(label, detail = '') {
  warnings += 1
  console.warn(`  WARN  ${label}${detail ? ` — ${detail}` : ''}`)
}
function fail(label, detail = '') {
  failures += 1
  console.warn(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
}

async function safe(fn, fallback = null) {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

console.warn(`\nChecking ${domain}\n`)

// --- DNS ---------------------------------------------------------------
console.warn('DNS')

const ns = (await safe(() => resolver.resolveNs(domain), [])) ?? []
if (ns.length === 0) {
  fail('nameservers', 'none found')
} else if (ns.some((n) => n.includes('nsone.net'))) {
  pass('nameservers', `Netlify DNS (${ns.length} records)`)
} else if (ns.some((n) => n.includes('domaincontrol.com'))) {
  warn('nameservers', `still GoDaddy (${ns[0]}) — fine if using external DNS`)
} else {
  warn('nameservers', ns.join(', '))
}

const apex = (await safe(() => resolver.resolve4(domain), [])) ?? []
if (apex.length === 0) {
  fail('apex A record', 'does not resolve')
} else if (apex.includes(NETLIFY_APEX_IP)) {
  pass('apex A record', NETLIFY_APEX_IP)
} else if (apex.some((ip) => ip.startsWith('76.223.') || ip.startsWith('13.248.'))) {
  fail('apex A record', `${apex.join(', ')} — still GoDaddy parking`)
} else {
  // Netlify DNS answers the apex from its own pool, not the documented IP.
  pass('apex A record', apex.join(', '))
}

const www = await safe(() => resolver.resolveCname(`www.${domain}`))
if (www) pass('www', `CNAME to ${www.join(', ')}`)
else if ((await safe(() => resolver.resolve4(`www.${domain}`), []))?.length) pass('www', 'resolves')
else warn('www', 'does not resolve')

const mx = (await safe(() => resolver.resolveMx(domain), [])) ?? []
if (mx.length > 0) pass('MX', mx.map((m) => m.exchange).join(', '))
else warn('MX', 'no mail records — expected unless email is set up')

// --- HTTPS -------------------------------------------------------------
console.warn('\nHTTPS')

const res = await safe(() => fetch(`https://${domain}/welcome`, { redirect: 'follow' }))
if (!res) {
  fail('https', 'no response — DNS may not have propagated, or no certificate yet')
} else {
  if (res.ok) pass('https', `${res.status} on /welcome`)
  else fail('https', `HTTP ${res.status}`)

  const plain = await safe(() => fetch(`http://${domain}/`, { redirect: 'manual' }))
  if (!plain) warn('http redirect', 'could not test')
  else if (plain.status >= 300 && plain.status < 400 && plain.headers.get('location')?.startsWith('https://')) {
    pass('http redirect', `${plain.status} to HTTPS`)
  } else {
    fail('http redirect', `expected a redirect to HTTPS, got ${plain.status}`)
  }

  /*
   * How the site is hosted changes what the rest of these checks can mean.
   *
   * On a Node host the middleware sets headers per request and protects
   * routes with a redirect. On GitHub Pages neither is possible: headers are
   * fixed by the host, and route protection happens in the browser after the
   * page loads. Judging a static deployment by the served-app's rules
   * produces failures that can never be fixed, which is worse than no check
   * at all — so detect which one this is and say so.
   */
  const html = await safe(() => res.text(), '')
  const isStatic = !res.headers.get('content-security-policy') && html.includes('http-equiv="Content-Security-Policy"')
  console.warn(`\nHosting: ${isStatic ? 'static (GitHub Pages)' : 'server-rendered'}`)

  // --- Headers ---------------------------------------------------------
  console.warn('\nSecurity headers')

  if (isStatic) {
    if (/http-equiv="Content-Security-Policy"/.test(html)) {
      pass('content-security-policy', 'meta tag (no nonce — a static host cannot mint one)')
    } else {
      fail('content-security-policy', 'no served header and no meta tag')
    }
    // GitHub Pages sets HSTS itself on custom domains.
    const hsts = res.headers.get('strict-transport-security')
    if (hsts) pass('strict-transport-security', hsts)
    else warn('strict-transport-security', 'not set by the host')
    warn('x-frame-options', 'cannot be set on a static host — clickjacking is unmitigated')
    warn('referrer-policy', 'cannot be set on a static host')
    warn('permissions-policy', 'cannot be set on a static host')
  } else {
    const required = {
      'content-security-policy': (v) =>
        v.includes("'nonce-") ? null : 'present but carries no nonce — middleware may not be running',
      'strict-transport-security': (v) =>
        /max-age=(\d+)/.exec(v)?.[1] >= 31536000 ? null : 'max-age is under a year',
      'x-content-type-options': (v) => (v === 'nosniff' ? null : `expected nosniff, got ${v}`),
      'x-frame-options': (v) => (v.toUpperCase() === 'DENY' ? null : `expected DENY, got ${v}`),
      'referrer-policy': () => null,
      'permissions-policy': () => null,
    }

    for (const [header, validate] of Object.entries(required)) {
      const value = res.headers.get(header)
      if (!value) {
        fail(header, 'missing')
        continue
      }
      const problem = validate(value)
      if (problem) warn(header, problem)
      else pass(header)
    }
  }

  if (res.headers.get('x-powered-by')) {
    warn('x-powered-by', `leaking ${res.headers.get('x-powered-by')}`)
  } else {
    pass('x-powered-by', 'absent')
  }

  // --- Indexing --------------------------------------------------------
  console.warn('\nIndexing')

  const robots = await safe(() => fetch(`https://${domain}/robots.txt`).then((r) => r.text()))
  if (robots && /^user-agent:/im.test(robots)) pass('robots.txt', robots.trim().split('\n')[0])
  else fail('robots.txt', 'missing or not a robots file')

  /*
   * On a static host `/my-day` always answers 200 — the redirect for a
   * signed-out visitor runs in the browser, after the HTML arrives. So the
   * useful question is not the status code but whether the page is wired to a
   * real database: a build with no Supabase project falls back to demo mode
   * and would serve the app to anyone.
   */
  const appPage = await safe(() => fetch(`https://${domain}/my-day`, { redirect: 'manual' }))
  if (!appPage) {
    warn('/my-day', 'could not test')
  } else if (!isStatic) {
    if (appPage.status >= 300 && appPage.status < 400) {
      pass('/my-day', `signed-out visitor redirected (${appPage.status})`)
    } else if (appPage.status === 200) {
      fail('/my-day', 'served to a signed-out visitor — the site is in DEMO MODE')
    } else {
      warn('/my-day', `HTTP ${appPage.status}`)
    }
  } else {
    /*
     * Look for the project reference in the JavaScript, using the sign-in
     * page rather than the landing page. Supabase is code-split out of the
     * landing route, which has no database dependency, so scanning that
     * page's chunks reports a wired site as unwired.
     */
    const loginHtml = await safe(() => fetch(`https://${domain}/login`).then((r) => r.text()), '')
    const chunk = [...new Set((loginHtml || html).match(/\/_next\/static\/chunks\/[A-Za-z0-9_.-]+\.js/g) ?? [])]
    let wired = false
    for (const path of chunk.slice(0, 25)) {
      const js = await safe(() => fetch(`https://${domain}${path}`).then((r) => r.text()), '')
      if (js && /[a-z]{20}\.supabase\.co/.test(js)) {
        wired = true
        break
      }
    }
    if (wired) pass('/my-day', 'static; bundle is wired to a Supabase project (guard runs client-side)')
    else fail('/my-day', 'no Supabase project in the bundle — the site is in DEMO MODE')
  }
}

console.warn(`\n${failures} failed, ${warnings} to review\n`)
process.exitCode = failures > 0 ? 1 : 0
