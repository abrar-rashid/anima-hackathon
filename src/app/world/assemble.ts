import { assembleLiveSnapshot } from '@/app/api/world/assemble-live'
import { assembleReplayComparison } from '@/app/api/world/assemble-replay'
import type { WorldSeries } from '@/components/world'
import { errorResponse } from '@/services/case-service'
import type { WorldSnapshot } from '@/world/types'

export type WorldAssembly = {
  snapshot: WorldSnapshot | null
  replay: { snapshots: WorldSnapshot[] } | null
  comparison: { left: WorldSeries; right: WorldSeries } | null
  error: string | null
}

function honestError(error: unknown): string {
  const { body } = errorResponse(error)
  const detail = body.detail ? ` ${body.detail}` : ''
  return `The borough atlas could not be assembled (${body.error}).${detail} No write was sent.`
}

/**
 * Server-side assembly. Calls the same read-only functions as the HTTP routes.
 * A missing live case is not an error. A failed replay is, because that is the
 * primary view. Nothing is invented when both sides are empty.
 */
export async function assembleWorld(): Promise<WorldAssembly> {
  let snapshot: WorldSnapshot | null = null
  let liveError: string | null = null
  try {
    snapshot = await assembleLiveSnapshot()
  } catch (error) {
    liveError = honestError(error)
  }

  try {
    const comparison = assembleReplayComparison()
    const empty =
      comparison.left.snapshots.length === 0 && comparison.right.snapshots.length === 0
    return {
      snapshot,
      replay: null,
      comparison: empty ? null : comparison,
      error: empty && snapshot === null ? (liveError ?? null) : null,
    }
  } catch (error) {
    if (snapshot) {
      return { snapshot, replay: null, comparison: null, error: null }
    }
    return { snapshot: null, replay: null, comparison: null, error: liveError ?? honestError(error) }
  }
}
