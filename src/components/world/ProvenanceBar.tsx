import type { WorldProvenance } from '@/world/types'
import styles from './instruments.module.css'

export type ProvenanceBarProps = {
  provenance: WorldProvenance
}

export function ProvenanceBar({ provenance }: ProvenanceBarProps) {
  return (
    <section className={styles.provenance} aria-labelledby="world-provenance-heading">
      <h2 id="world-provenance-heading" className={styles.clock}>
        Provenance
      </h2>
      <p data-world-id="">{`World ${provenance.world}`}</p>
      <p data-denominator="">
        {`Built from ${String(provenance.denominator.cases)} cases and ${String(provenance.denominator.events)} events`}
      </p>
      {provenance.replay ? (
        <p className={styles.replay} data-replay-label="">
          {`${provenance.replay.label} · captured ${provenance.replay.capturedAt}`}
        </p>
      ) : null}
    </section>
  )
}
