'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { WorldSnapshot } from '@/world/types'
import { AccessibleWorld } from './AccessibleWorld'
import { EventTicker } from './EventTicker'
import { seriesTimeRange, snapshotAtOrBefore } from './format'
import { ProvenanceBar } from './ProvenanceBar'
import { TimeScrubber } from './TimeScrubber'
import { useReducedMotion } from './use-reduced-motion'
import type { WorldSeries } from './WorldComparison'
import { WorldComparison } from './WorldComparison'
import { WorldCanvas } from './WorldCanvas'
import { WorldEmpty } from './WorldEmpty'
import { WorldLegend } from './WorldLegend'
import styles from './world.module.css'

export type WorldViewProps = {
  snapshot?: WorldSnapshot | null
  replay?: { snapshots: WorldSnapshot[] } | null
  comparison?: { left: WorldSeries; right: WorldSeries } | null
  errorMessage?: string | null
}

/**
 * THESIS: Care is one city; a result is a phial; a covenant is a stitch. Refuses dashboards and invented bustle.
 * OWN-WORLD: Night-watch indigo wool, lantern paper, phosphor thread, 8px civic pixel atlas.
 * STORY: The viewer watches ownership and neglect, never a clinical rank.
 * FIRST VIEWPORT: Provenance, then the atlas well, then the time instrument.
 * FORM: Phosphor Borough Atlas. FINISH: unreviewed and undocumented is unfinished.
 */
export function WorldView({ snapshot = null, replay = null, comparison = null, errorMessage = null }: WorldViewProps) {
  const reducedMotion = useReducedMotion()
  const replayRange = useMemo(() => (replay ? seriesTimeRange([replay.snapshots]) : null), [replay])
  const [replayNow, setReplayNow] = useState(() => replayRange?.max ?? snapshot?.now ?? 0)
  const replaySnap = replay ? snapshotAtOrBefore(replay.snapshots, replayNow) : null
  const frame = replaySnap ?? snapshot

  if (errorMessage) {
    return (
      <WorldShell>
        <WorldEmpty reason="error" message={errorMessage} sectionId="world-as-data" />
        <WorldLegend snapshot={null} />
      </WorldShell>
    )
  }

  if (comparison) {
    return (
      <WorldShell>
        <WorldComparison left={comparison.left} right={comparison.right} />
      </WorldShell>
    )
  }

  if (!frame) {
    return (
      <WorldShell>
        <WorldEmpty reason="empty" sectionId="world-as-data" />
        <WorldLegend snapshot={null} />
      </WorldShell>
    )
  }

  const range = replayRange ?? { min: frame.now, max: frame.now }

  return (
    <WorldShell>
      <ProvenanceBar provenance={frame.provenance} />
      <div className={styles.well}>
        <WorldCanvas snapshot={frame} reducedMotion={reducedMotion} />
      </div>
      <TimeScrubber
        now={replay ? replayNow : frame.now}
        min={range.min}
        max={range.max}
        paused={frame.paused}
        speed={frame.speed}
        onSeek={replay ? setReplayNow : undefined}
      />
      <div className={styles.instruments}>
        <EventTicker events={frame.events} />
        <WorldLegend snapshot={frame} />
      </div>
      <AccessibleWorld snapshot={frame} />
    </WorldShell>
  )
}

function WorldShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page} data-world-view="">
      <a className={styles.skip} href="#world-as-data">
        Skip to world as data
      </a>
      <header className={styles.mast}>
        <p className={styles.nav}>
          <a href="/case/SIM-000001">Case workspace</a>
        </p>
        <h1>Pixel Societies</h1>
        <p>
          The same covenant drawn as a night-watch city. Every borough, phial and stitch is a field
          from the snapshot. This view never writes and never ranks how sick anyone is.
        </p>
      </header>
      {children}
    </div>
  )
}
