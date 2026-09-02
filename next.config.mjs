/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    dirs: ['src', 'scripts'],
  },
  // Naming the framework and its version in a response header tells an
  // attacker which CVEs to try first, and tells nobody else anything.
  poweredByHeader: false,
  // Netlify serves the built output; a trailing-slash mismatch between the
  // host and the app is a common source of duplicate URLs and 308 chains.
  trailingSlash: false,
}

export default nextConfig
