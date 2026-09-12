'use client'

import { useState } from 'react'
import styles from './case-workspace.module.css'

export type CovenantGraphNodeSource = {
  recordId: string
  version: number
  actor: string
  event: string
}

export type CovenantGraphNode = {
  id: string
  label: string
  icon: string
  active: boolean
  source?: CovenantGraphNodeSource
}

export type CovenantGraphTrack = {
  id: string
  label: string
  nodes: CovenantGraphNode[]
}

export type CovenantGraphProps = {
  tracks: CovenantGraphTrack[]
  currentOwner: string
  selectedNodeId?: string
  onSelectNode?: (id: string) => void
}

export function CovenantGraph({ tracks, currentOwner, selectedNodeId, onSelectNode }: CovenantGraphProps) {
  const [internalId, setInternalId] = useState<string | null>(null)
  const selectedId = selectedNodeId ?? internalId
  const selected = tracks.flatMap((track) => track.nodes).find((node) => node.id === selectedId)
  const owner = currentOwner.trim() || 'unknown — owner missing from snapshot'

  function select(id: string) {
    onSelectNode?.(id)
    if (selectedNodeId === undefined) setInternalId(id)
  }

  return (
    <section className={styles.panel} aria-labelledby="covenant-graph-heading">
      <h2 id="covenant-graph-heading">Covenant graph</h2>
      <p className={styles.owner}>Current accountable owner: {owner}</p>
      <div className={styles.stack}>
        {tracks.map((track) => {
          const headingId = `track-${track.id}`
          return (
            <section key={track.id} aria-labelledby={headingId}>
              <h3 id={headingId}>{track.label}</h3>
              <ol className={styles.trackList}>
                {track.nodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      className={node.active ? styles.nodeCurrent : styles.node}
                      aria-current={node.active ? 'step' : undefined}
                      onClick={() => select(node.id)}
                    >
                      <span aria-hidden="true">{node.icon}</span>
                      <span>{node.label}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )
        })}
      </div>
      {selected ? (
        <div className={styles.detail} role="region" aria-label="Selected node evidence">
          <h3>{selected.label}</h3>
          {selected.source ? (
            <dl className={styles.meta}>
              <div>
                <dt>Record</dt>
                <dd>{selected.source.recordId}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{selected.source.version}</dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>{selected.source.actor}</dd>
              </div>
              <div>
                <dt>Event</dt>
                <dd>{selected.source.event}</dd>
              </div>
            </dl>
          ) : (
            <p className={styles.muted}>No source record is attached to this node.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}
