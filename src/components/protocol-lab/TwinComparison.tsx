import type { ReactNode } from 'react'
import styles from './protocol-lab.module.css'

export type TrackState = {
  ownershipState: string
  closureState: string
  currentAccountableOwner: { teamId: string; actorId?: string }
}

export type TwinTrackRun = {
  protocolId: string
  finalState: TrackState
}

function formatDelta(value: number | null): string {
  return value === null ? 'n/a' : String(value)
}

function headingId(label: string): string {
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`
}

function TrackList({ label, state }: { label: string; state: TrackState }) {
  const owner = state.currentAccountableOwner.actorId
    ? `${state.currentAccountableOwner.teamId} (${state.currentAccountableOwner.actorId})`
    : state.currentAccountableOwner.teamId
  const heading = headingId(label)

  return (
    <section className={styles.section}>
      <h4 className={styles.trackTitle} id={heading}>
        {label}
      </h4>
      <ol className={styles.track} aria-labelledby={heading} aria-label={label}>
        <li>Ownership: {state.ownershipState}</li>
        <li>Care: {state.closureState}</li>
        <li>Current accountable owner: {owner}</li>
      </ol>
    </section>
  )
}

export function TwinComparison({
  baseline,
  candidate,
  deltas,
  sameTrace,
  graph,
}: {
  baseline: TwinTrackRun
  candidate: TwinTrackRun
  deltas: Record<string, number | null>
  sameTrace: boolean
  graph?: (props: { label: string; state: TrackState }) => ReactNode
}) {
  const Graph = graph ?? ((props: { label: string; state: TrackState }) => <TrackList {...props} />)

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Replayed comparison</h3>
      {sameTrace ? <p className={styles.lede}>Same immutable trace replayed under both protocols.</p> : null}
      <div className={styles.tracks}>
        <Graph label={`Baseline ${baseline.protocolId}`} state={baseline.finalState} />
        <Graph label={`Candidate ${candidate.protocolId}`} state={candidate.finalState} />
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption>Comparison metrics</caption>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">Delta</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(deltas).map(([metric, value]) => (
              <tr key={metric}>
                <th scope="row">{metric}</th>
                <td>{formatDelta(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
