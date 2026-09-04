// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from '@/lib/download'

/**
 * The download path, tested through the DOM rather than by trusting it.
 *
 * The reported symptom was a button that appeared to do nothing. That can
 * happen three ways — the anchor never being clicked, the file being empty,
 * or the browser refusing a blob URL — so each is asserted separately.
 */

let createdBlobs: Blob[]
let clicked: HTMLAnchorElement[]

beforeEach(() => {
  createdBlobs = []
  clicked = []

  // jsdom implements neither of these.
  URL.createObjectURL = vi.fn((blob: Blob) => {
    createdBlobs.push(blob)
    return `blob:mock/${createdBlobs.length}`
  }) as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL

  // Record the click without letting jsdom attempt a navigation.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('downloadTextFile', () => {
  it('fires a download click carrying the filename', () => {
    const outcome = downloadTextFile({
      filename: 'flowline-evening-report-2026-08-31.txt',
      contents: 'Work scheduled: 14\nCompleted: 9\n',
    })

    expect(outcome).toEqual({ ok: true, filename: 'flowline-evening-report-2026-08-31.txt' })
    expect(clicked).toHaveLength(1)
    expect(clicked[0]!.download).toBe('flowline-evening-report-2026-08-31.txt')
    expect(clicked[0]!.href).toMatch(/^blob:/)
  })

  it('puts the report date in the filename', () => {
    const outcome = downloadTextFile({ filename: 'flowline-evening-report-2026-01-09.txt', contents: 'x' })
    expect(outcome.filename).toContain('2026-01-09')
  })

  it('writes a non-empty file containing the report text', async () => {
    const contents = 'FLOWLINE EVENING REPORT\n31 August 2026\nWork scheduled: 14\n'
    downloadTextFile({ filename: 'r.txt', contents })

    expect(createdBlobs).toHaveLength(1)
    const blob = createdBlobs[0]!
    expect(blob.size).toBeGreaterThan(0)
    expect(await blob.text()).toBe(contents)
    expect(blob.type).toContain('text/plain')
  })

  it('refuses to save an empty file instead of producing a 0-byte one', () => {
    const outcome = downloadTextFile({ filename: 'r.txt', contents: '   \n  ' })

    expect(outcome.ok).toBe(false)
    expect(clicked).toHaveLength(0)
    if (!outcome.ok) expect(outcome.reason).toMatch(/nothing/i)
  })

  it('removes the anchor again, leaving the document as it found it', () => {
    const before = document.body.children.length
    downloadTextFile({ filename: 'r.txt', contents: 'data' })
    expect(document.body.children.length).toBe(before)
  })

  it('reports a failure rather than claiming success', () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error('Blob storage is full')
    }) as unknown as typeof URL.createObjectURL

    const outcome = downloadTextFile({ filename: 'r.txt', contents: 'data' })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toBe('Blob storage is full')
  })

  describe('on iOS Safari, which ignores download on blob URLs', () => {
    beforeEach(() => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      )
    })

    it('opens the file instead, so the save is not silently lost', () => {
      const open = vi.fn(() => ({}) as Window)
      vi.stubGlobal('open', open)

      const outcome = downloadTextFile({ filename: 'r.txt', contents: 'data' })

      expect(outcome.ok).toBe(true)
      expect(open).toHaveBeenCalledOnce()
      // No anchor click — that is the path that does nothing on iOS.
      expect(clicked).toHaveLength(0)
    })

    it('says so when the new tab is blocked', () => {
      vi.stubGlobal(
        'open',
        vi.fn(() => null),
      )

      const outcome = downloadTextFile({ filename: 'r.txt', contents: 'data' })

      expect(outcome.ok).toBe(false)
      if (!outcome.ok) expect(outcome.reason).toMatch(/pop-?ups/i)
    })
  })
})
