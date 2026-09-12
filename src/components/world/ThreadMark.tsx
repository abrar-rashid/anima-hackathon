import type { WorldThread } from '@/world/types'
import styles from './atlas.module.css'
import { THREAD_STATE_LABEL } from './format'
import { districtCenter } from './geometry'
import { threadStroke } from './sprites'

export function ThreadMark({ thread, animate }: { thread: WorldThread; animate: boolean }) {
  const from = districtCenter(thread.fromTeamId)
  const to = districtCenter(thread.toTeamId)
  const mx = Math.round((from.x + to.x) / 2)
  const my = Math.round((from.y + to.y) / 2 - 14)
  const d = `M ${String(from.x)} ${String(from.y)} Q ${String(mx)} ${String(my)} ${String(to.x)} ${String(to.y)}`
  const stroke = threadStroke(thread.state)
  const inflight = thread.state === 'REQUESTED' && animate

  return (
    <g
      data-thread={thread.threadId}
      data-thread-state={thread.state}
      data-overdue-minutes={thread.overdueMinutes}
    >
      <title>{`${THREAD_STATE_LABEL[thread.state]} · overdue ${String(thread.overdueMinutes)} minutes`}</title>
      <path
        d={d}
        fill="none"
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeDasharray={stroke.dash === 'none' ? undefined : stroke.dash}
        className={inflight ? styles.threadInflight : undefined}
      />
      {thread.overdueMinutes > 0 ? (
        <text className={styles.overdue} x={mx} y={my - 2}>
          {thread.overdueMinutes}
        </text>
      ) : null}
    </g>
  )
}
