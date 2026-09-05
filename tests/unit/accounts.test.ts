import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_DOMAIN,
  emailForLoginId,
  generatePassword,
  isSyntheticEmail,
  loginIdProblem,
  MIN_PASSWORD_LENGTH,
  normaliseLoginId,
} from '@/lib/accounts'

/**
 * The login ID rules, which have to agree in three places: this module, the
 * CHECK constraint in migration 0014, and the edge function. A mismatch shows
 * up as an ID the owner can type and the database then refuses.
 */

describe('normalising', () => {
  it('trims and lowercases, so the same person is one account', () => {
    expect(normaliseLoginId('  Suresh ')).toBe('suresh')
    expect(normaliseLoginId('SURESH')).toBe('suresh')
  })
})

describe('validation', () => {
  it.each(['suresh', 'meena.joshi', 'arjun_desai', 'kavita-patil', 'a1b', '9lives'])('accepts %s', (id) => {
    expect(loginIdProblem(id)).toBeNull()
  })

  it.each([
    ['', 'Enter a login ID.'],
    ['ab', 'A login ID needs at least 3 characters.'],
    ['a'.repeat(32), 'A login ID can be at most 31 characters.'],
  ])('rejects %s', (id, message) => {
    expect(loginIdProblem(id)).toBe(message)
  })

  it.each([
    ['has space', 'a space would be lost in the address'],
    ['.leading', 'must start with a letter or number'],
    ['-leading', 'must start with a letter or number'],
    ['has@at', '@ would break the synthetic address'],
    ['has/slash', 'not permitted'],
    ['emoji🙂here', 'not permitted'],
  ])('rejects %s (%s)', (id) => {
    expect(loginIdProblem(id)).toMatch(/lowercase letters, numbers/)
  })

  it('accepts capitals by normalising rather than refusing them', () => {
    // An owner typing "Suresh" should not be told off; it is the same ID.
    expect(loginIdProblem('Suresh')).toBeNull()
    expect(emailForLoginId('Suresh')).toBe(`suresh@${ACCOUNT_DOMAIN}`)
  })
})

describe('the synthetic address', () => {
  it('is derived purely, so signing in needs no lookup', () => {
    // Deriving it rather than asking the server is what stops the sign-in
    // screen answering "does this account exist" for anyone who asks.
    expect(emailForLoginId('meena.joshi')).toBe(`meena.joshi@${ACCOUNT_DOMAIN}`)
    expect(emailForLoginId('meena.joshi')).toBe(emailForLoginId('  MEENA.JOSHI  '))
  })

  it('is recognisable, so a real address is not mistaken for one', () => {
    expect(isSyntheticEmail(`suresh@${ACCOUNT_DOMAIN}`)).toBe(true)
    expect(isSyntheticEmail('rajesh@gmail.com')).toBe(false)
    expect(isSyntheticEmail(null)).toBe(false)
  })
})

describe('generated passwords', () => {
  it('meets the minimum length', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generatePassword().length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH)
    }
  })

  it('is readable aloud — words and digits, no ambiguous soup', () => {
    expect(generatePassword()).toMatch(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/)
  })

  it('does not repeat across many draws', () => {
    // Not a randomness proof, but it would catch a generator stuck on one
    // value or seeded identically each call.
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()))
    expect(seen.size).toBeGreaterThan(190)
  })
})
