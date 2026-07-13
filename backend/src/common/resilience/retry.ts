/**
 * Retry with exponential backoff, plus a circuit breaker.
 *
 * Pure helpers (no Nest injection) so adapters can use them without wiring a
 * module. Usage:
 *
 *   const breaker = new CircuitBreaker({ failureThreshold: 5, resetMs: 30_000 })
 *   return breaker.run(() => retry(() => fetch(url), { attempts: 4 }))
 */

export interface RetryOptions {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  factor?: number
  jitter?: boolean
  shouldRetry?: (err: unknown) => boolean
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 4
  const base = opts.baseDelayMs ?? 200
  const max = opts.maxDelayMs ?? 5_000
  const factor = opts.factor ?? 2
  const jitter = opts.jitter ?? true
  let err: unknown
  for (let i = 0; i < attempts; i++) {
    try { return await fn() }
    catch (e) {
      err = e
      if (opts.shouldRetry && !opts.shouldRetry(e)) throw e
      if (i === attempts - 1) break
      const delay = Math.min(max, base * Math.pow(factor, i))
      const wait = jitter ? delay * (0.5 + Math.random()) : delay
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw err
}

export type BreakerState = 'closed' | 'open' | 'half-open'

export class CircuitBreaker {
  private failures = 0
  private openUntil = 0
  state: BreakerState = 'closed'

  constructor(private opts: { failureThreshold?: number; resetMs?: number } = {}) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now()
    if (this.state === 'open') {
      if (now < this.openUntil) throw new Error('Circuit breaker open')
      this.state = 'half-open'
    }
    try {
      const out = await fn()
      this.onSuccess()
      return out
    } catch (e) {
      this.onFailure()
      throw e
    }
  }

  private onSuccess() {
    this.failures = 0
    this.state = 'closed'
  }

  private onFailure() {
    this.failures += 1
    const threshold = this.opts.failureThreshold ?? 5
    if (this.failures >= threshold) {
      this.state = 'open'
      this.openUntil = Date.now() + (this.opts.resetMs ?? 30_000)
    }
  }
}
