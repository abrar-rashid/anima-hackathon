import type { WorldSnapshot } from '@/world/types'
import { directionPhrase, neglectBand, THREAD_STATE_LABEL } from './format'
import styles from './instruments.module.css'

const MARKS: { id: string; text: string }[] = [
  { id: 'occupied', text: 'Phosphor plinth: this district currently owns or is asked to accept at least one result.' },
  { id: 'empty-district', text: 'No plinth: this district has zero owned and zero pending results.' },
  { id: 'above', text: `High meniscus: analyte is ${directionPhrase('above')}. Not a severity.` },
  { id: 'below', text: `Low meniscus: analyte is ${directionPhrase('below')}. Not a severity.` },
  { id: 'fresh', text: 'Fresh phial: neglectMinutes is 0.' },
  { id: 'dust', text: 'Dust pixels: neglectMinutes 1–29. One rot pixel per 16 neglected minutes.' },
  { id: 'crack', text: 'Crack/moss pixels: neglectMinutes 30–119.' },
  { id: 'rot', text: 'Rot pixels: neglectMinutes 120 or more, capped at 18 pixels.' },
  { id: 'REQUESTED', text: THREAD_STATE_LABEL.REQUESTED },
  { id: 'ACCEPTED', text: THREAD_STATE_LABEL.ACCEPTED },
  { id: 'DECLINED', text: THREAD_STATE_LABEL.DECLINED },
  { id: 'OVERDUE', text: THREAD_STATE_LABEL.OVERDUE },
  { id: 'RECEIVER_UNAVAILABLE', text: THREAD_STATE_LABEL.RECEIVER_UNAVAILABLE },
  { id: 'STALE', text: THREAD_STATE_LABEL.STALE },
  { id: 'pending-tray', text: 'Brass tray: this district has been asked to accept the named result and has not accepted.' },
]

export type WorldLegendProps = {
  snapshot: WorldSnapshot | null
}

export function WorldLegend({ snapshot }: WorldLegendProps) {
  return (
    <section className={styles.legend} aria-labelledby="world-legend-heading">
      <h2 id="world-legend-heading">How to read the atlas</h2>
      <p>
        Colour is never the only encoding. Each mark also has a shape, a word, and a row in World as
        data. Direction is only a comparison to the source-supplied reference range.
      </p>
      <ul>
        {MARKS.map((mark) => (
          <li key={mark.id} data-legend={mark.id}>
            <span className={styles.swatch} data-swatch={mark.id} aria-hidden="true" />
            <span>{mark.text}</span>
          </li>
        ))}
      </ul>
      {snapshot ? (
        <p data-legend-live="">
          This frame: {neglectBand(snapshot.entities[0]?.neglectMinutes ?? 0)} band on the first
          result, {String(snapshot.threads.length)} threads, clock{' '}
          {snapshot.paused ? 'paused' : 'running'} at speed {String(snapshot.speed)}.
        </p>
      ) : (
        <p>No snapshot — the legend describes encodings, not a living city.</p>
      )}
    </section>
  )
}
