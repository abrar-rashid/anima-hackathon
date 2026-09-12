import type { WorldDistrict } from '@/world/types'
import styles from './atlas.module.css'
import { plotFor } from './geometry'
import { PixelLayer } from './PixelLayer'
import { buildingPixels, occupancyPlinth } from './sprites'

export function DistrictMark({ district }: { district: WorldDistrict }) {
  const plot = plotFor(district.teamId)
  const occupied = district.ownedEntityIds.length + district.pendingEntityIds.length > 0
  const pixels = [
    ...buildingPixels(district.teamId, plot.x + 8, plot.y + 4),
    ...occupancyPlinth(plot.x + 8, plot.y + 4, occupied),
  ]

  return (
    <g
      data-district={district.teamId}
      data-owned-count={district.ownedEntityIds.length}
      data-pending-count={district.pendingEntityIds.length}
      data-occupied={occupied ? 'true' : 'false'}
    >
      <PixelLayer pixels={pixels} prefix={`district-${district.teamId}`} />
      <text className={styles.label} x={plot.x + 8} y={plot.y + 52} fontSize={8}>
        {district.label}
      </text>
    </g>
  )
}
