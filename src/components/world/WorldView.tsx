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

function hasSeries(comparison: WorldViewProps['comparison']): comparison is { left: WorldSeries; right: WorldSeries } {
  if (!comparison) return false
  return comparison.left.snapshots.length > 0 || comparison.right.snapshots.length > 0
}

/**
 * THESIS: Care is one city; a result is a phial; a covenant is a stitch. Refuses dashboards and invented bustle.
 * OWN-WORLD: Night-watch indigo wool, lantern paper, phosphor thread, 8px civic pixel atlas.
 * STORY: The viewer watches ownership and neglect, never a clinical rank.
 * FIRST VIEWPORT: Same-trace comparison, then the sparse live case.
 * FORM: Phosphor Borough Atlas.
 */
export function WorldView({ snapshot = null, replay = null, comparison = null, errorMessage = null }: WorldViewProps) {
  const reducedMotion = useReducedMotion()
  const replayRange = useMemo(() => (replay ? seriesTimeRange([replay.snapshots]) : null), [replay])
  const [replayNow, setReplayNow] = useState(() => replayRange?.max ?? snapshot?.now ?? 0)
  const replaySnap = replay ? snapshotAtOrBefore(replay.snapshots, replayNow) : null
  const compared = hasSeries(comparison)
  const frame = compared ? null : (replaySnap ?? snapshot)

  if (errorMessage && !compared && !snapshot && !replaySnap) {
    return (
      <WorldShell>
        <WorldEmpty reason="error" message={errorMessage} sectionId="world-as-data" />
        <WorldLegend snapshot={null} />
      </WorldShell>
    )
  }

  if (!compared && !frame) {
    return (
      <WorldShell>
        <WorldEmpty reason="empty" sectionId="world-as-data" />
        <WorldLegend snapshot={null} />
      </WorldShell>
    )
  }

  return (
    <WorldShell>
      {compared && comparison ? (
        <section className={styles.primary} aria-labelledby="world-comparison-heading">
          <h2 id="world-comparison-heading">Same immutable trace</h2>
          <p className={styles.live}>
            One recorded event log, replayed under two protocol versions. Scrub simulator time to
            watch ownership diverge. Numbers are computed from the replay.
          </p>
          <WorldComparison left={comparison.left} right={comparison.right} />
        </section>
      ) : null}

      {snapshot ? (
        <section className={styles.secondary} data-live-case="" aria-labelledby="world-live-heading">
          <h2 id="world-live-heading">Current stored case</h2>
          <p className={styles.live}>
            {`${String(snapshot.provenance.denominator.cases)} cases and ${String(snapshot.provenance.denominator.events)} events from the case store. Sparse because that is the store. This view does not invent neighbours.`}
          </p>
          <SocietyFrame
            snapshot={snapshot}
            reducedMotion={reducedMotion}
            sectionId={compared ? 'world-as-data-live' : 'world-as-data'}
          />
        </section>
      ) : null}

      {!compared && replaySnap ? (
        <SocietyFrame
          snapshot={replaySnap}
          reducedMotion={reducedMotion}
          range={replayRange}
          onSeek={setReplayNow}
          seekNow={replayNow}
        />
      ) : null}
    </WorldShell>
  )
}

function SocietyFrame({
  snapshot,
  reducedMotion,
  sectionId = 'world-as-data',
  range,
  onSeek,
  seekNow,
}: {
  snapshot: WorldSnapshot
  reducedMotion: boolean
  sectionId?: string
  range?: { min: number; max: number } | null
  onSeek?: (simulatorTime: number) => void
  seekNow?: number
}) {
  const span = range ?? { min: snapshot.now, max: snapshot.now }
  const now = seekNow ?? snapshot.now
  return (
    <>
      <ProvenanceBar provenance={snapshot.provenance} />
      <div className={styles.well}>
        <WorldCanvas snapshot={snapshot} reducedMotion={reducedMotion} />
      </div>
      <TimeScrubber
        now={now}
        min={span.min}
        max={span.max}
        paused={snapshot.paused}
        speed={snapshot.speed}
        onSeek={onSeek}
      />
      <div className={styles.instruments}>
        <EventTicker events={snapshot.events} />
        <WorldLegend snapshot={snapshot} />
      </div>
      <AccessibleWorld snapshot={snapshot} sectionId={sectionId} />
    </>
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
