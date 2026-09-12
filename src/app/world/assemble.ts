import type { WorldSeries } from '@/components/world'
import type { WorldSnapshot } from '@/world/types'

export type WorldAssembly = {
  snapshot: WorldSnapshot | null
  replay: { snapshots: WorldSnapshot[] } | null
  comparison: { left: WorldSeries; right: WorldSeries } | null
  error: string | null
}

/**
 * Optional assembly. Projection and replay are owned by another worker.
 * This loader never invents a society when those modules are absent.
 */
export async function assembleWorld(): Promise<WorldAssembly> {
  return {
    snapshot: null,
    replay: null,
    comparison: null,
    error: null,
  }
}
