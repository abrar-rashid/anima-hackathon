'use client'

import { useEffect, useState } from 'react'
import { NeighbourhoodView } from './NeighbourhoodView'
import { emptyModel, type TownModel } from './model'
import styles from './neighbourhood.module.css'

/**
 * Loads the neighbourhood for the cockpit's town tab. The map has its own
 * read path (`/api/ctl/town`) so it does not wait on the three-column case
 * payload, and it does not go through the retired PixelTownCanvas.
 */
export function TownEmbed() {
  const [model, setModel] = useState<TownModel | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/ctl/town', { cache: 'no-store' })
      .then(async (response) => {
        const body: unknown = await response.json()
        if (!body || typeof body !== 'object' || !('model' in body)) {
          throw new Error('town refresh returned an unexpected body')
        }
        return (body as { model: TownModel }).model
      })
      .then((next) => {
        if (cancelled) return
        setModel(next)
        setError(null)
      })
      .catch((caught) => {
        if (cancelled) return
        const message = caught instanceof Error ? caught.message : String(caught)
        setError(message)
        setModel((current) => current ?? emptyModel(Date.now(), message))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!model) {
    return (
      <div className={styles.page} data-embedded="true">
        <p className={styles.headerNote} role="status">
          {error ?? 'Reading the neighbourhood from the simulator…'}
        </p>
      </div>
    )
  }

  return <NeighbourhoodView initial={model} embedded />
}
