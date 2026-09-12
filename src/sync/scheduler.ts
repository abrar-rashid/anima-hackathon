import type { SyncCursor } from '@/sync/cursor'
import type { SyncPassResult } from '@/sync/pull'

export interface SchedulerClock {
  now(): number
}

export interface SyncRunRecord {
  startedAt: number
  finishedAt: number
  attempts: number
  status: 'ok' | 'failed'
  pulled: number
  changed: number
  cursor?: SyncCursor
  error?: string
}

export interface SyncSchedulerOptions {
  intervalMs: number
  clock: SchedulerClock
  sleep: (ms: number) => Promise<void>
  run: () => Promise<SyncPassResult>
  maxAttempts?: number
  backoffMs?: (attempt: number) => number
}

export function isTransientSyncError(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : NaN
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /\b(408|429|502|503|504|ECONNRESET|ETIMEDOUT|fetch failed)\b/i.test(message)
}

export class SyncScheduler {
  private readonly intervalMs: number
  private readonly clock: SchedulerClock
  private readonly sleep: (ms: number) => Promise<void>
  private readonly runPass: () => Promise<SyncPassResult>
  private readonly maxAttempts: number
  private readonly backoffMs: (attempt: number) => number
  private running = false
  private lastStartedAt: number | null = null
  private last: SyncRunRecord | null = null

  constructor(options: SyncSchedulerOptions) {
    this.intervalMs = options.intervalMs
    this.clock = options.clock
    this.sleep = options.sleep
    this.runPass = options.run
    this.maxAttempts = options.maxAttempts ?? 3
    this.backoffMs = options.backoffMs ?? ((attempt) => options.intervalMs * 2 ** (attempt - 1))
  }

  get inFlight(): boolean {
    return this.running
  }

  get lastRun(): SyncRunRecord | null {
    return this.last
  }

  async tick(): Promise<SyncRunRecord | null> {
    if (this.running) return null
    const startedAt = this.clock.now()
    if (this.lastStartedAt !== null && startedAt - this.lastStartedAt < this.intervalMs) {
      return null
    }

    this.running = true
    this.lastStartedAt = startedAt
    try {
      const record = await this.execute(startedAt)
      this.last = record
      return record
    } finally {
      this.running = false
    }
  }

  private async execute(startedAt: number): Promise<SyncRunRecord> {
    let attempts = 0
    let lastError: unknown
    while (attempts < this.maxAttempts) {
      attempts += 1
      try {
        const result = await this.runPass()
        return {
          startedAt,
          finishedAt: this.clock.now(),
          attempts,
          status: 'ok',
          pulled: result.records.length,
          changed: result.changes.length,
          cursor: result.cursor,
        }
      } catch (error) {
        lastError = error
        if (!isTransientSyncError(error) || attempts >= this.maxAttempts) {
          return {
            startedAt,
            finishedAt: this.clock.now(),
            attempts,
            status: 'failed',
            pulled: 0,
            changed: 0,
            error: error instanceof Error ? error.message : String(error),
          }
        }
        await this.sleep(this.backoffMs(attempts))
      }
    }
    return {
      startedAt,
      finishedAt: this.clock.now(),
      attempts,
      status: 'failed',
      pulled: 0,
      changed: 0,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    }
  }
}
