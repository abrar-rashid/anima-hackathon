import { pendingAnchor } from './geometry'
import { PixelLayer } from './PixelLayer'
import { pendingTrayPixels } from './sprites'

export function PendingMark({
  teamId,
  entityId,
  index,
}: {
  teamId: string
  entityId: string
  index: number
}) {
  const anchor = pendingAnchor(teamId, index)
  return (
    <g data-pending-tray={entityId} data-pending-district={teamId}>
      <title>{`Pending acceptance ${entityId} at ${teamId}`}</title>
      <PixelLayer pixels={pendingTrayPixels(anchor.x, anchor.y)} prefix={`pending-${teamId}-${entityId}`} />
    </g>
  )
}
