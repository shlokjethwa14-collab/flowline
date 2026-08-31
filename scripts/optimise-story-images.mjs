/**
 * Turns full-resolution source photographs into the portrait WebP files the
 * landing story scatters across the screen.
 *
 * Stock originals arrive at print resolution — the eight used here totalled
 * 65 MB, which is more than the entire rest of the site. Run this after
 * dropping new .jpg/.png sources into public/story; it writes the .webp
 * beside them and deletes the source so the heavy file never reaches git.
 *
 *   node scripts/optimise-story-images.mjs
 */
import { readdir, unlink, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'story')

/**
 * Portrait 3:4 at roughly 2x the largest on-screen size, so the scatter stays
 * sharp on a retina display without shipping print resolution.
 */
const WIDTH = 720
const HEIGHT = 960

const sources = (await readdir(DIR)).filter((file) => /\.(jpe?g|png)$/i.test(file))

if (sources.length === 0) {
  console.warn('Nothing to do — no .jpg or .png sources in public/story.')
}

for (const file of sources) {
  const src = join(DIR, file)
  const outName = file.replace(/\.(jpe?g|png)$/i, '.webp')

  await sharp(src)
    // `attention` crops toward the busiest region rather than the middle,
    // which keeps faces and product in frame on a 3:4 crop of a wide photo.
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
    .webp({ quality: 72 })
    .toFile(join(DIR, outName))

  const { size } = await stat(join(DIR, outName))
  console.warn(`${file} -> ${outName}  ${(size / 1024).toFixed(0)} KB`)

  await unlink(src)
}
