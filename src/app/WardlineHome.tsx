'use client'

import { useCallback, useState } from 'react'
import { TownEmbed } from '@/components/neighbourhood/TownEmbed'
import {
  ConnectedSources,
  PatientDirectory,
  TaskBoard,
  WardlineShell,
  type WardlineNav,
  type WardlinePayload,
} from '@/components/wardline'
import '@/design/tokens.css'
import '@/components/wardline/wardline-tokens.css'

const TITLES: Record<WardlineNav, string> = {
  tasks: 'Clinical taskboard',
  patients: 'Patient directory',
  sources: 'Connected sources',
  map: 'Neighbourhood map',
}

export function WardlineHome({ initial }: { initial: WardlinePayload }) {
  const [nav, setNav] = useState<WardlineNav>('tasks')
  const [data, setData] = useState<WardlinePayload>(initial)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async (refresh = false) => {
    setSyncing(true)
    try {
      const response = await fetch(`/api/ctl/wardline${refresh ? '?refresh=1' : ''}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(25_000),
      })
      const body = (await response.json()) as WardlinePayload
      setData(body)
    } catch (error) {
      setData((current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
        stale: true,
      }))
    } finally {
      setSyncing(false)
    }
  }, [])

  return (
    <WardlineShell
      nav={nav}
      onNav={setNav}
      title={TITLES[nav]}
      eyebrow="Northbank clinical operations"
      world={data.world}
      live={Boolean(data.live)}
      recordCount={data.scan.scanned}
      onSync={() => void load(true)}
      syncing={syncing}
    >
      {nav === 'map' ? (
        <div style={{ height: '100%', minHeight: 0 }}>
          <TownEmbed />
        </div>
      ) : (
        <>
          {data.error ? (
            <p role="status">
              {data.stale ? 'Showing last successful read. ' : ''}
              {data.error}
            </p>
          ) : null}
          {nav === 'tasks' ? (
            <TaskBoard
              tasks={data.tasks}
              stats={data.stats}
              now={data.clock.now}
              patients={data.patients}
              chains={data.chains ?? []}
              bloodWorkflows={data.bloodWorkflows ?? []}
              medlatency={data.medlatency}
            />
          ) : null}
          {nav === 'patients' ? (
            <PatientDirectory
              patients={data.patients}
              tasks={data.tasks}
              profilesShown={data.profilesShown}
              directoryTotal={data.directoryTotal}
              bloodWorkflows={data.bloodWorkflows ?? []}
            />
          ) : null}
          {nav === 'sources' ? <ConnectedSources sources={data.sources} scan={data.scan} /> : null}
        </>
      )}
    </WardlineShell>
  )
}
