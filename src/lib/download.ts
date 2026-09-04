/**
 * Saving a generated file, in a way that works on a phone.
 *
 * The anchor-plus-blob dance is the only broadly supported way to do this,
 * but it has two failure modes that were not being handled:
 *
 *   - The anchor must be in the document before it is clicked. Firefox
 *     ignores a click on a detached element.
 *   - iOS Safari has historically refused to honour `download` on a blob
 *     URL, navigating to it or doing nothing. There is no feature test for
 *     this, so the fallback opens the content in a new tab where it can at
 *     least be read and shared, rather than appearing to do nothing at all.
 *
 * Returns what happened, so the caller can say something true rather than
 * announcing success unconditionally.
 */
export type DownloadOutcome =
  | { ok: true; filename: string }
  | { ok: false; reason: string; filename: string }

export interface DownloadOptions {
  filename: string
  contents: string
  mime?: string
}

/** iOS refuses `download` on blob URLs; detect it rather than feature-test. */
function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

export function downloadTextFile({ filename, contents, mime = 'text/plain;charset=utf-8' }: DownloadOptions): DownloadOutcome {
  if (contents.trim().length === 0) {
    return { ok: false, reason: 'There was nothing to put in the file.', filename }
  }

  let url: string | null = null
  try {
    const blob = new Blob([contents], { type: mime })
    url = URL.createObjectURL(blob)

    if (isIosSafari()) {
      // Opening rather than downloading: Safari on iOS will render the text
      // and offer its own share sheet, which is the closest thing to a save.
      const opened = window.open(url, '_blank')
      if (!opened) {
        return {
          ok: false,
          reason: 'Your browser blocked the new tab. Allow pop-ups for this site, then try again.',
          filename,
        }
      }
      return { ok: true, filename }
    }

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    // Must be in the document: Firefox ignores clicks on detached anchors.
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    return { ok: true, filename }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'The file could not be created.',
      filename,
    }
  } finally {
    // Revoking immediately can cancel a download that has not started yet.
    if (url) {
      const toRevoke = url
      setTimeout(() => URL.revokeObjectURL(toRevoke), 2_000)
    }
  }
}
