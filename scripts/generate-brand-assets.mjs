/**
 * Renders the favicon set and the Open Graph card from one source mark.
 *
 * Kept as a script rather than hand-drawn files so the brand lives in exactly
 * one place: change the gradient or the glyph here and every size regenerates
 * consistently.
 *
 *   node scripts/generate-brand-assets.mjs
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/** The same violet the app uses for its primary. */
const FROM = '#8b7bf5'
const TO = '#6d58f0'

/**
 * The Lucide "waves" glyph, which is the mark used in the sidebar and on the
 * sign-in screen. Traced here rather than imported so this script has no
 * dependency on the React component tree.
 */
const WAVES = `
  <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1"
        fill="none" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1"
        fill="none" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 1.3 0 1.9-.5 2.5-1"
        fill="none" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
`

/** A rounded violet tile with the mark centred. `size` is the viewBox edge. */
function iconSvg(size) {
  const pad = size * 0.22
  const glyph = size - pad * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${FROM}"/>
      <stop offset="1" stop-color="${TO}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.225}" fill="url(#g)"/>
  <g transform="translate(${pad} ${pad + glyph * 0.08}) scale(${glyph / 19})">${WAVES}</g>
</svg>`
}

/** 1200x630 link preview card. */
function ogSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a0a11"/>
      <stop offset="0.55" stop-color="#171733"/>
      <stop offset="1" stop-color="#10262b"/>
    </linearGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${FROM}"/>
      <stop offset="1" stop-color="${TO}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#6d58f0" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#6d58f0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="960" cy="150" r="380" fill="url(#glow)"/>
  <rect x="88" y="150" width="104" height="104" rx="26" fill="url(#tile)"/>
  <g transform="translate(110 176) scale(3.2)">${WAVES}</g>
  <text x="88" y="360" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif"
        font-size="76" font-weight="600" letter-spacing="-2.4" fill="#ffffff">Flowline</text>
  <text x="88" y="428" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif"
        font-size="35" font-weight="400" fill="#b9bcd0">Daily work, kept simple.</text>
  <text x="88" y="516" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif"
        font-size="25" font-weight="500" letter-spacing="3.2" fill="#7f8399">CKLTASK.COM</text>
</svg>`
}

const icon = Buffer.from(iconSvg(512))

await writeFile(join(PUBLIC, 'icon.svg'), iconSvg(64))
await sharp(icon).resize(192, 192).png().toFile(join(PUBLIC, 'icon-192.png'))
await sharp(icon).resize(512, 512).png().toFile(join(PUBLIC, 'icon-512.png'))
// Apple ignores transparency and rounds the corners itself.
await sharp(icon).resize(180, 180).png().toFile(join(PUBLIC, 'apple-icon.png'))
await sharp(Buffer.from(ogSvg())).png().toFile(join(PUBLIC, 'og.png'))

/*
 * A real multi-size .ico. sharp cannot write ICO, so the container is built
 * by hand — it is a short, well-documented format, and the alternative is a
 * dependency for six bytes of header.
 */
const sizes = [16, 32, 48]
const pngs = await Promise.all(sizes.map((s) => sharp(icon).resize(s, s).png().toBuffer()))

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // 1 = icon
header.writeUInt16LE(sizes.length, 4)

let offset = 6 + sizes.length * 16
const entries = pngs.map((png, i) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 0) // width
  entry.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], 1) // height
  entry.writeUInt8(0, 2) // palette size
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += png.length
  return entry
})

await writeFile(join(PUBLIC, 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]))

console.warn('brand assets written to public/: icon.svg, favicon.ico, icon-192/512, apple-icon, og.png')
