import type { WorldSnapshot } from '@/world/types'
import styles from './atlas.module.css'
import { DistrictMark } from './DistrictMark'
import { EntityMark } from './EntityMark'
import { ATLAS } from './geometry'
import { PixelLayer } from './PixelLayer'
import { PendingMark } from './PendingMark'
import { groundPixels } from './sprites'
import { ThreadMark } from './ThreadMark'

export type WorldCanvasProps = {
  snapshot: WorldSnapshot
  reducedMotion?: boolean
}

/**
 * SVG, not canvas: every district, phial and stitch stays in the DOM with
 * data-* attributes that tests and assistive tech can read. Pixel art is
 * integer rects on an 8px grid with shape-rendering: crispEdges.
 */
export function WorldCanvas({ snapshot, reducedMotion = false }: WorldCanvasProps) {
  const staticFrame = reducedMotion || snapshot.paused
  const ownerIndex = new Map<string, number>()

  return (
    <figure className={styles.frame}>
      <svg
        className={styles.atlas}
        viewBox={`0 0 ${String(ATLAS.width)} ${String(ATLAS.height)}`}
        role="img"
        data-world-atlas=""
        data-entity-count={snapshot.entities.length}
        data-district-count={snapshot.districts.length}
        data-thread-count={snapshot.threads.length}
        data-event-count={snapshot.events.length}
        data-motion={staticFrame ? 'static' : 'live'}
        data-paused={snapshot.paused ? 'true' : 'false'}
        data-speed={snapshot.speed}
        data-now={snapshot.now}
        aria-labelledby="world-atlas-title world-atlas-desc"
      >
        <title id="world-atlas-title">{`Borough atlas for ${snapshot.provenance.world}`}</title>
        <desc id="world-atlas-desc">
          {`${String(snapshot.districts.length)} districts, ${String(snapshot.entities.length)} results, ${String(snapshot.threads.length)} threads, drawn only from the snapshot.`}
        </desc>
        <PixelLayer pixels={groundPixels()} prefix="ground" />
        {snapshot.districts.map((district) => (
          <DistrictMark key={district.teamId} district={district} />
        ))}
        {snapshot.threads.map((thread) => (
          <ThreadMark key={thread.threadId} thread={thread} animate={!staticFrame} />
        ))}
        {snapshot.districts.flatMap((district) =>
          district.pendingEntityIds.map((entityId, index) => (
            <PendingMark
              key={`${district.teamId}-pending-${entityId}`}
              teamId={district.teamId}
              entityId={entityId}
              index={index}
            />
          )),
        )}
        {snapshot.entities.map((entity) => {
          const next = ownerIndex.get(entity.ownerTeamId) ?? 0
          ownerIndex.set(entity.ownerTeamId, next + 1)
          return <EntityMark key={entity.entityId} entity={entity} index={next} />
        })}
      </svg>
      <figcaption className={styles.caption}>
        {`${snapshot.districts.length} districts · ${snapshot.entities.length} results · ${snapshot.threads.length} threads`}
      </figcaption>
    </figure>
  )
}
