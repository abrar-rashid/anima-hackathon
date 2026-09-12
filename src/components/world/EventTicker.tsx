import type { WorldEvent } from '@/world/types'
import { formatSimulatorTime } from './format'
import styles from './instruments.module.css'

export type EventTickerProps = {
  events: WorldEvent[]
}

export function EventTicker({ events }: EventTickerProps) {
  const latest = events.length > 0 ? events[events.length - 1] : null

  return (
    <section className={styles.ticker} aria-labelledby="world-ticker-heading">
      <h2 id="world-ticker-heading">Recorded events</h2>
      {events.length === 0 ? (
        <p>No events in this snapshot.</p>
      ) : (
        <ol>
          {events.map((event) => (
            <li key={event.eventId} data-event={event.eventId} data-event-kind={event.kind}>
              <time className={styles.time} dateTime={formatSimulatorTime(event.simulatorTime)}>
                {formatSimulatorTime(event.simulatorTime)}
              </time>
              <span className={styles.kind}>{event.kind}</span>
              <p className={styles.detail}>{event.detail}</p>
              {event.districtId ? <p className={styles.time}>{event.districtId}</p> : null}
              <p className={styles.time}>{event.entityId}</p>
            </li>
          ))}
        </ol>
      )}
      <p className={styles.time} role="status" aria-live="polite">
        {latest ? `${latest.kind}: ${latest.detail}` : 'No events in this snapshot.'}
      </p>
    </section>
  )
}
