import type { MetadataRoute } from 'next'

/**
 * Lets people add Flowline to a phone home screen and open it without browser
 * chrome — worth having when the audience is supervisors on the floor rather
 * than people at a desk.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Flowline',
    short_name: 'Flowline',
    description: 'Daily work, kept simple.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#6d58f0',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
