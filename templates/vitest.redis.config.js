// Canonical vitest.config.js — Redis-backed service (session cache).
//
// `unit` mocks Redis; `integration` uses a real Redis via Testcontainers
// (test/setup/global-redis.js).
//
// Gotchas baked in:
//   - `USE_SINGLE_INSTANCE_CACHE: 'true'` so @hapi/catbox-redis treats it as a
//     single node (otherwise it attempts a cluster handshake and fails).
//   - Unit project PINS `REDIS_HOST: 'redis', REDIS_PORT: '6379'` so the
//     Testcontainers port from the integration globalSetup can't leak into unit
//     assertions if Vitest reuses the process.
//   - `clearMocks: true` at BOTH the top level and inside each project.
//   - OIDC/Entra dummies must match what the app boots with under Convict
//     (e.g. the exact ENTRA_REDIRECT_URL your redirect assertions expect).
import { defineConfig, configDefaults } from 'vitest/config'

const sharedEnv = {
  NODE_ENV: 'test',
  ENTRA_TENANT_ID: 'test-tenant-id',
  ENTRA_WELL_KNOWN_URL: 'https://login.microsoftonline.com/test-tenant-id/v2.0/.well-known/openid-configuration',
  ENTRA_CLIENT_ID: 'test-client-id',
  ENTRA_CLIENT_SECRET: 'test-client-secret',
  ENTRA_REDIRECT_URL: 'http://localhost:3003/auth/sign-in-oidc',
  ENTRA_SIGN_OUT_REDIRECT_URL: 'http://localhost:3003/auth/sign-out-oidc',
  COOKIE_PASSWORD: 'test-cookie-password-at-least-32-chars!!',
  USE_SINGLE_INSTANCE_CACHE: 'true',
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
          // Unit tests mock Redis; this host satisfies config validation. The port
          // is pinned so the integration Testcontainers port can't leak in.
          env: { ...sharedEnv, REDIS_HOST: 'redis', REDIS_PORT: '6379' }
        }
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.js'],
          clearMocks: true,
          environment: 'node',
          // REDIS_HOST / REDIS_PORT are provided by the Testcontainers globalSetup.
          env: sharedEnv,
          globalSetup: ['./test/setup/global-redis.js']
        }
      }
    ]
  }
})
