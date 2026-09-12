'use client'

import { useMemo, useState } from 'react'
import type { WorldSnapshot } from '@/world/types'
import { AccessibleWorld } from './AccessibleWorld'
import { EventTicker } from './EventTicker'
import { seriesTimeRange, snapshotAtOrBefore } from './format'
import styles from './instruments.module.css'
import { ProvenanceBar } from './ProvenanceBar'
import { TimeScrubber } from './TimeScrubber'
import { useReducedMotion } from './use-reduced-motion'
import { WorldCanvas } from './WorldCanvas'
import { WorldEmpty } from './WorldEmpty'
import { WorldLegend } from './WorldLegend'

export type WorldSeries = {
  heading: string
  snapshots: WorldSnapshot[]
}

export type WorldComparisonProps = {
  left: WorldSeries
  right: WorldSeries
}

export function WorldComparison({ left, right }: WorldComparisonProps) {
  const range = useMemo(
    () => seriesTimeRange([left.snapshots, right.snapshots]),
    [left.snapshots, right.snapshots],
  )
  const [now, setNow] = useState(() => range?.max ?? 0)
  const reducedMotion = useReducedMotion()
  const leftSnap = snapshotAtOrBefore(left.snapshots, now)
  const rightSnap = snapshotAtOrBefore(right.snapshots, now)

  if (!range) {
    return <WorldEmpty reason="empty" message="Both replay series are empty." />
  }

  return (
    <div className={styles.pair} data-world-comparison="">
      <SocietyColumn
        heading={left.heading}
        snapshot={leftSnap}
        reducedMotion={reducedMotion}
        side="left"
      />
      <SocietyColumn
        heading={right.heading}
        snapshot={rightSnap}
        reducedMotion={reducedMotion}
        side="right"
      />
      <div className={styles.span}>
        <TimeScrubber
          now={now}
          min={range.min}
          max={range.max}
          paused={leftSnap?.paused ?? rightSnap?.paused ?? true}
          speed={leftSnap?.speed ?? rightSnap?.speed ?? 0}
          onSeek={setNow}
        />
      </div>
    </div>
  )
}

function SocietyColumn({
  heading,
  snapshot,
  reducedMotion,
  side,
}: {
  heading: string
  snapshot: WorldSnapshot | null
  reducedMotion: boolean
  side: 'left' | 'right'
}) {
  return (
    <section className={styles.side} data-society={side} aria-label={heading}>
      <h3>{heading}</h3>
      {snapshot ? (
        <>
          <ProvenanceBar provenance={snapshot.provenance} />
          <WorldCanvas snapshot={snapshot} reducedMotion={reducedMotion} />
          <EventTicker events={snapshot.events} />
          <WorldLegend snapshot={snapshot} />
          <AccessibleWorld
            snapshot={snapshot}
            sectionId={side === 'left' ? 'world-as-data' : 'world-as-data-right'}
          />
        </>
      ) : (
        <WorldEmpty reason="empty" message={`${heading} has no snapshot at this simulator time.`} />
      )}
    </section>
  )
}
