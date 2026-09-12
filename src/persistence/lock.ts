export type WriteLock = <T>(fn: () => T | Promise<T>) => Promise<T>

/** Serializes writers on one store so a put/append cannot interleave mid-record. */
export function createWriteLock(): WriteLock {
  let tail: Promise<void> = Promise.resolve()
  return function lock<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = tail.then(fn, fn)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}
