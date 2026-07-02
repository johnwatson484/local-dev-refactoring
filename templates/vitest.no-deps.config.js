// Canonical vitest.config.js — service with NO real backing store (all external
// calls mocked; e.g. a frontend that mocks its backend API).
//
// Two projects: `unit` and `integration`, both host-native, no globalSetup.
// `sharedEnv` provides the non-secret dummy values the app needs to boot under
// Convict validation (replaces env that a compose.test.yml used to inject).
//
// SSR repos: remember `npm test` must run `npm run build:frontend` FIRST (because
// `.npmrc` ignore-scripts=true disables `pretest`). See package-scripts.md.
import { defineConfig, configDefaults } from 'vitest/config'

const sharedEnv = {
  NODE_ENV: 'test',
  MY_BACKEND_ENDPOINT: 'http://localhost:3001'
}

const coverageConfig = {
  provider: 'v8',
  reportsDirectory: './coverage',
  clean: false,
  reporter: ['text', 'lcov'],
  include: ['src/**/*.js'],
  exclude: [
    ...configDefaults.exclude,
    '**/test/**',
    'coverage',
    '.public'
  ]
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
          env: sharedEnv
        }
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.js'],
          clearMocks: true,
          environment: 'node',
          env: sharedEnv
        }
      }
    ]
  }
})
