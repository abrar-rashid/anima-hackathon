import type { WorldEntity } from '@/world/types'
import { entityAnchor } from './geometry'
import { neglectBand, rotPixelCount } from './format'
import { PixelLayer } from './PixelLayer'
import { phialPixels } from './sprites'

export function EntityMark({ entity, index }: { entity: WorldEntity; index: number }) {
  const anchor = entityAnchor(entity.ownerTeamId, index)
  const rot = rotPixelCount(entity.neglectMinutes)
  const band = neglectBand(entity.neglectMinutes)

  return (
    <g
      data-entity={entity.entityId}
      data-neglect={entity.neglectMinutes}
      data-direction={entity.direction}
      data-rot-band={band}
      data-rot-pixels={rot}
      data-ownership={entity.ownershipState}
      data-closure={entity.closureState}
      data-exceptions={entity.exceptionCount}
      data-chases={entity.manualChases}
      data-duplicates={entity.duplicateSuppressed}
    >
      <title>{`${entity.analyteName} · ${entity.direction} source range · neglect ${String(entity.neglectMinutes)} minutes`}</title>
      <PixelLayer pixels={phialPixels(anchor.x, anchor.y, entity.direction, rot)} prefix={`entity-${entity.entityId}`} />
    </g>
  )
}
