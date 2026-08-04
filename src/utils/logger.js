/**
 * Production-Safe Logging Utility
 * Microsoft/Apple Enterprise Security Standard
 *
 * Prevents information leakage in production builds while
 * maintaining debug capabilities in development.
 */

const isDevelopment = import.meta.env.DEV
const isProduction = import.meta.env.PROD

/**
 * Secure logger that strips debug logs in production
 * but always allows errors and warnings
 */
export const logger = {
  /**
   * Debug-level logging (ONLY in development)
   * Use for detailed debugging information
   */
  log: isDevelopment ? console.log.bind(console) : () => {},

  /**
   * Debug logging (ONLY in development)
   * Use for debugging info
   */
  debug: isDevelopment ? console.debug.bind(console) : () => {},

  /**
   * Informational logging (ONLY in development)
   * Use for general info messages
   */
  info: isDevelopment ? console.info.bind(console) : () => {},

  /**
   * Warning-level logging (ALWAYS logged)
   * Use for non-critical issues that should be investigated
   */
  warn: console.warn.bind(console),

  /**
   * Error-level logging (ALWAYS logged)
   * Use for errors and exceptions
   */
  error: console.error.bind(console),

  /**
   * Table logging (ONLY in development)
   * Use for structured data display
   */
  table: isDevelopment ? console.table.bind(console) : () => {},

  /**
   * Group logging (ONLY in development)
   * Use for grouped console output
   */
  group: isDevelopment ? console.group.bind(console) : () => {},
  groupEnd: isDevelopment ? console.groupEnd.bind(console) : () => {},

  /**
   * SECURITY: Sanitize sensitive data before logging
   * Removes passwords, tokens, keys, and PII
   */
  sanitize: (data) => {
    if (!data) return data

    const sensitiveKeys = [
      'password',
      'token',
      'apiKey',
      'api_key',
      'secret',
      'auth',
      'authorization',
      'bearer',
      'sessionId',
      'session_id',
      'ssn',
      'social_security',
      'credit_card',
      'creditCard',
      'cvv',
      'pin'
    ]

    const sanitized = JSON.parse(JSON.stringify(data))

    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj

      Object.keys(obj).forEach(key => {
        const lowerKey = key.toLowerCase()

        // Check if key contains sensitive terms
        const isSensitive = sensitiveKeys.some(term =>
          lowerKey.includes(term.toLowerCase())
        )

        if (isSensitive) {
          obj[key] = '[REDACTED]'
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key])
        }
      })

      return obj
    }

    return sanitizeObject(sanitized)
  },

  /**
   * Log sanitized data (development only)
   */
  logSanitized: (label, data) => {
    if (isDevelopment) {
      console.log(label, logger.sanitize(data))
    }
  },

  /**
   * Performance timing (development only)
   */
  time: isDevelopment ? console.time.bind(console) : () => {},
  timeEnd: isDevelopment ? console.timeEnd.bind(console) : () => {},
}

export default logger
