// Canonical vitest.config.js — Postgres-backed service with Liquibase migrations.
//
// `unit` mocks the database; `integration` runs against a real Postgres with
// migrations applied, spun up via Testcontainers (test/setup/global-db.js).
//
// No sharedEnv secrets are needed here beyond NODE_ENV for unit — the DB connection
// vars are injected by the globalSetup for the integration project.
import { defineConfig, configDefaults } from 'vitest/config'

const coverageConfig = {
  provider: 'v8',
  reportsDirectory: './coverage',
  clean: false,
  reporter: ['text', 'lcov'],
  include: ['src/**/*.js'],
  exclude: [...configDefaults.exclude, 'coverage', '**/test/**']
}

export default defineConfig({
  test: {
    globals: true,
    clearMocks: true,
    coverage: coverageConfig,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.js'],
          clearMocks: true,
          environment: 'node',
          env: {
            NODE_ENV: 'test'
          }
        }
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.js'],
          clearMocks: true,
          environment: 'node',
          globalSetup: ['./test/setup/global-db.js']
        }
      }
    ]
  }
})
