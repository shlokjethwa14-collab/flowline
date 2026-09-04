/**
 * Whether the AI features can work, decided before anyone presses a button.
 *
 * The old behaviour was to let people write a transcript, press "Read the
 * call", wait, and only then be told the server has no key — or, on a static
 * deployment, to have `fetch` receive a 404 page and fail parsing it. Both
 * spend the user's effort before admitting the feature was never going to
 * work. This answers the question up front so the control can be disabled
 * with a reason attached.
 */

export type AiStatus =
  /** Still asking the server. */
  | { state: 'checking' }
  /** Ready to use. */
  | { state: 'ready' }
  /**
   * Not available, with a reason a person can act on. `fix` is the concrete
   * step an administrator would take.
   */
  | { state: 'unavailable'; reason: string; fix: string }

/** Set in the static export, which has no server and therefore no /api. */
const STATIC_EXPORT = process.env.NEXT_PUBLIC_STATIC_EXPORT === '1'

export const AI_UNAVAILABLE_STATIC: AiStatus = {
  state: 'unavailable',
  reason: 'This copy of Flowline is published as a static site, so it has no server to run the AI on.',
  fix: 'Deploy Flowline to a host that runs Node — Netlify, Vercel or a VPS — and set ANTHROPIC_API_KEY there. See DEPLOY.md.',
}

export const AI_UNAVAILABLE_UNCONFIGURED: AiStatus = {
  state: 'unavailable',
  reason: 'The server is running, but no AI key is configured.',
  fix: 'Add ANTHROPIC_API_KEY to the environment and restart. Get a key at console.anthropic.com/settings/keys.',
}

export const AI_UNAVAILABLE_UNREACHABLE: AiStatus = {
  state: 'unavailable',
  reason: 'The AI service could not be reached.',
  fix: 'Check the server is running and reachable, then reopen this dialog.',
}

/**
 * Asked once per page load and shared by every caller.
 *
 * A module-level promise rather than per-component state: the recorder and
 * the assignment dialog both need this, and neither should trigger its own
 * round trip.
 */
let cached: Promise<AiStatus> | null = null

export function probeAi(): Promise<AiStatus> {
  if (STATIC_EXPORT) return Promise.resolve(AI_UNAVAILABLE_STATIC)
  if (cached) return cached

  cached = (async (): Promise<AiStatus> => {
    try {
      const response = await fetch('/api/ai/draft', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      })
      // A static host answers the 404 page here rather than JSON.
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        return AI_UNAVAILABLE_STATIC
      }
      const payload = (await response.json()) as { configured?: boolean }
      return payload.configured ? { state: 'ready' } : AI_UNAVAILABLE_UNCONFIGURED
    } catch {
      return AI_UNAVAILABLE_UNREACHABLE
    }
  })()

  return cached
}

/** Test seam — lets a suite start from a known state. */
export function resetAiProbe() {
  cached = null
}
