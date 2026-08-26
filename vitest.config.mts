import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const srcRoot = fileURLToPath(new URL('./src', import.meta.url))

/**
 * Two suites with very different needs.
 *
 * `unit` is pure logic — dates, report building, validation — and runs in
 * parallel. `db` builds a throwaway Postgres database per file and applies
 * every migration, so it is slow, serial, and given a generous timeout.
 * Keeping them apart means a developer without a database can still run
 * `npm run test:unit` and get useful signal.
 */
export default defineConfig({
  resolve: {
    alias: { '@': srcRoot },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@': srcRoot } },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: { '@': srcRoot } },
        test: {
          name: 'db',
          environment: 'node',
          include: ['tests/db/**/*.test.ts'],
          // Each file provisions and drops its own database.
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
})
