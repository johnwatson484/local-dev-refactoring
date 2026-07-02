// Canonical hapi-pulse registration with a short dev graceful-shutdown timeout.
//
// Why: hapi-pulse waits `timeout` ms for in-flight requests to drain on SIGTERM/SIGINT
// before exiting. In production a generous 10s avoids dropping real traffic. In local
// dev with `node --watch`, every file save restarts the process — a 10s drain makes
// each restart feel sluggish, so use 1s locally for snappy hot reload.
//
// `config.get('isDevelopment')` is a computed Convict value derived from NODE_ENV.
import hapiPulse from 'hapi-pulse'
import { createLogger } from './logging/logger.js'
import { config } from '../../config.js'

const tenSeconds = 10 * 1000
const oneSecond = 1 * 1000

const pulse = {
  plugin: hapiPulse,
  options: {
    logger: createLogger(),
    timeout: config.get('isDevelopment') ? oneSecond : tenSeconds
  }
}

export { pulse }
