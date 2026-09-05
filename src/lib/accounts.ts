/**
 * Login IDs, and how they become something Supabase Auth can key an account
 * on.
 *
 * Supabase requires an email address. The people using Flowline mostly do not
 * have one, so each login ID is mapped to a synthetic address on a domain
 * that receives no mail. Nothing is ever sent there — it exists to give Auth
 * a unique, syntactically valid identifier, so passwords stay inside Supabase
 * rather than being something this app stores and checks itself.
 *
 * The mapping is pure and computed on both sides, so signing in needs no
 * lookup. That is also what stops the sign-in screen becoming a way to
 * enumerate the company: asking the server "does this ID exist" before a
 * password is offered would answer that question for anyone who asked.
 */

/** Kept in step with migration 0014 and the edge function by hand. */
export const ACCOUNT_DOMAIN = 'accounts.ckltask.com'

export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,30}$/

export const MIN_PASSWORD_LENGTH = 10

export function emailForLoginId(loginId: string): string {
  return `${normaliseLoginId(loginId)}@${ACCOUNT_DOMAIN}`
}

/**
 * What Supabase should be given for whatever someone typed into the sign-in
 * box.
 *
 * Staff type a login ID and never see an address. The owner may instead have
 * a real one, because the very first account is the one case where a
 * deliverable mailbox is worth having: it is the only account nobody else can
 * reset the password for, and without it a forgotten owner password means
 * recovering the project from the Supabase dashboard.
 *
 * An "@" is the whole test. Login IDs cannot contain one — the shape
 * constraint forbids it — so the two can never be confused.
 */
export function credentialToEmail(identifier: string): string {
  const trimmed = identifier.trim().toLowerCase()
  return trimmed.includes('@') ? trimmed : emailForLoginId(trimmed)
}

/** True when what was typed looks like an address rather than a login ID. */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.trim().includes('@')
}

/**
 * Accepts either form. The login ID rules still apply to login IDs; an
 * address only has to be minimally plausible, because the real check is
 * whether the sign-in succeeds.
 */
export function identifierProblem(raw: string): string | null {
  const value = raw.trim()
  if (value.length === 0) return 'Enter your login ID.'
  if (looksLikeEmail(value)) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? null : 'That email address does not look right.'
  }
  return loginIdProblem(value)
}

/** Trim and lowercase, so "  Suresh " and "suresh" are the same person. */
export function normaliseLoginId(raw: string): string {
  return raw.trim().toLowerCase()
}

export function loginIdProblem(raw: string): string | null {
  const id = normaliseLoginId(raw)
  if (id.length === 0) return 'Enter a login ID.'
  if (id.length < 3) return 'A login ID needs at least 3 characters.'
  if (id.length > 31) return 'A login ID can be at most 31 characters.'
  if (!LOGIN_ID_PATTERN.test(id)) {
    return 'Use lowercase letters, numbers, dot, underscore or hyphen — no spaces or capitals.'
  }
  return null
}

/** True when an account was made from a login ID rather than a real address. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${ACCOUNT_DOMAIN}`))
}

/**
 * A password an owner can read aloud once and an employee can type on a
 * phone.
 *
 * Deliberately not a random character soup: those get written on a wall
 * because nobody can retype them. Three short words and two digits is around
 * 44 bits against this word list, which is far beyond guessing through a
 * rate-limited login, and it survives being repeated across a noisy room.
 *
 * Uses crypto.getRandomValues, never Math.random — a credential chosen by a
 * predictable generator is not a credential.
 */
const WORDS = [
  'anchor', 'basket', 'candle', 'dagger', 'ember', 'fabric', 'garden', 'hammer',
  'indigo', 'jacket', 'kettle', 'ladder', 'mango', 'nectar', 'orbit', 'pillar',
  'quartz', 'ribbon', 'saddle', 'timber', 'umber', 'velvet', 'walnut', 'yonder',
  'cotton', 'denim', 'linen', 'silk', 'thread', 'weave', 'loom', 'dye',
]

export function generatePassword(): string {
  const buffer = new Uint32Array(4)
  crypto.getRandomValues(buffer)
  const words = Array.from(buffer.slice(0, 3), (n) => WORDS[n % WORDS.length])
  const digits = (buffer[3]! % 90) + 10
  return `${words.join('-')}-${digits}`
}
