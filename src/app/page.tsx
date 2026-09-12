'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CommandCockpit,
  type CockpitData,
  type LoopActReceipt,
  type LoopActStep,
  type TaskLedgerItem,
} from '@/components/cockpit/CommandCockpit'
import { TownEmbed } from '@/components/neighbourhood/TownEmbed'
import { ProtocolLab } from '@/components/ProtocolLab'
import '@/design/tokens.css'
import styles from './page.module.css'

type ViewMode = 'cockpit' | 'town' | 'lab'

type LiveSimulation = CockpitData & {
  world?: string
  live?: boolean
}

export default function Home() {
  const [viewMode, setViewMode] = useState<ViewMode>('cockpit')
  const [patientId, setPatientId] = useState('SIM-000001')
  const [simData, setSimData] = useState<LiveSimulation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isActing, setIsActing] = useState(false)
  const [ledgerExtras, setLedgerExtras] = useState<TaskLedgerItem[]>([])
  const [lastReceipt, setLastReceipt] = useState<LoopActReceipt | null>(null)
  const [agentPending, setAgentPending] = useState(false)

  const fetchLiveState = useCallback(async (pId: string) => {
    try {
      const res = await fetch(`/api/simulation/live?patientId=${pId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as LiveSimulation
      setSimData(data)
      setError(null)
    } catch (err) {
      console.error('Failed to load simulation state:', err)
      setError('Could not reach the Anima simulator.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchProposal = useCallback(async (pId: string) => {
    setAgentPending(true)
    try {
      const res = await fetch(`/api/simulation/case?patientId=${pId}`, { cache: 'no-store' })
      const body = (await res.json()) as { caseSnapshot: LiveSimulation['caseSnapshot'] }
      setSimData((prev) => (prev ? { ...prev, caseSnapshot: body.caseSnapshot } : prev))
    } catch (err) {
      console.error('Agent proposal unavailable:', err)
    } finally {
      setAgentPending(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await fetchLiveState(patientId)
      if (!cancelled) void fetchProposal(patientId)
    })()
    const interval = window.setInterval(() => {
      void fetchLiveState(patientId)
    }, 15000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [fetchLiveState, fetchProposal, patientId])

  const handleAdvanceClock = async (minutes: 10 | 30 | 90) => {
    try {
      const res = await fetch('/api/simulation/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceMinutes: minutes }),
      })
      if (res.ok) await fetchLiveState(patientId)
    } catch (err) {
      console.error('Clock advance error:', err)
    }
  }

  const handleExecuteAct = async (step: LoopActStep = 'auto_close'): Promise<LoopActReceipt> => {
    setIsActing(true)
    try {
      const res = await fetch('/api/simulation/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, step }),
      })
      const body = (await res.json().catch(() => ({}))) as Partial<LoopActReceipt> & { message?: string }
      const receipt: LoopActReceipt = {
        ok: res.ok,
        step,
        message: body.message,
        receipts: body.receipts ?? [],
      }
      if (res.ok) await fetchLiveState(patientId)
      setLastReceipt(receipt)
      return receipt
    } catch (err) {
      console.error('Act error:', err)
      const failed: LoopActReceipt = { ok: false, step, message: 'Action failed before a receipt was returned.' }
      setLastReceipt(failed)
      return failed
    } finally {
      setIsActing(false)
    }
  }

  const cockpitData: CockpitData | null = simData
    ? {
        patient: {
          ...simData.patient,
          observations: simData.patient.observations ?? [],
        },
        tasks: [...(simData.tasks ?? []), ...ledgerExtras],
        caseSnapshot: simData.caseSnapshot,
        agentPending,
        clock: simData.clock,
      }
    : null

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.mark} aria-hidden="true">
            ⌘
          </div>
          <div>
            <h1 className={styles.wordmark}>Close The Loop</h1>
            <p className={styles.tagline}>Clinical task governance · Anima ADK + live EHR simulation</p>
          </div>
        </div>

        <div className={styles.switcher} role="group" aria-label="Application view">
          <button
            type="button"
            aria-pressed={viewMode === 'cockpit'}
            data-active={viewMode === 'cockpit'}
            className={styles.switchBtn}
            onClick={() => setViewMode('cockpit')}
          >
            Command Cockpit
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'town'}
            data-active={viewMode === 'town'}
            className={styles.switchBtn}
            onClick={() => setViewMode('town')}
          >
            Pixel Town Sim
          </button>
          <button
            type="button"
            aria-pressed={viewMode === 'lab'}
            data-active={viewMode === 'lab'}
            className={styles.switchBtn}
            onClick={() => setViewMode('lab')}
          >
            Protocol Twin Lab
          </button>
        </div>

        <div className={styles.aside}>
          <label className={styles.srOnly} htmlFor="patient-switcher">
            Patient
          </label>
          <select
            id="patient-switcher"
            className={styles.patientSelect}
            value={patientId}
            onChange={(event) => {
              setLoading(true)
              setLedgerExtras([])
              setLastReceipt(null)
              setPatientId(event.target.value)
            }}
          >
            <option value="SIM-000001">Amira Khan (SIM-000001)</option>
            <option value="SIM-000006">Eleanor Chen (SIM-000006)</option>
            <option value="SIM-000007">David Wilson (SIM-000007)</option>
          </select>
          <Link className={styles.worklistLink} href="/worklist">
            Worklist
          </Link>
          <div className={styles.livePill}>
            <span className={styles.liveDot} aria-hidden="true" />
            <span>Live Sim: {simData?.world ?? 'connecting'}</span>
          </div>
        </div>
      </header>

      <main className={viewMode === 'town' ? `${styles.main} ${styles.mainTown}` : styles.main}>
        {viewMode === 'town' ? (
          <TownEmbed />
        ) : loading && !simData ? (
          <div className={styles.loading} role="status">
            <div className={styles.loadingMark} aria-hidden="true" />
            <div>Connecting to Anima simulator and assembling patient EHR…</div>
          </div>
        ) : error ? (
          <div className={styles.error} role="alert">
            <strong>Connection notice:</strong> {error}
          </div>
        ) : (
          <>
            {viewMode === 'cockpit' && cockpitData ? (
              <CommandCockpit
                data={cockpitData}
                onAdvanceClock={handleAdvanceClock}
                onExecuteAct={handleExecuteAct}
                onCreateTask={(task) => setLedgerExtras((prev) => [task, ...prev])}
                initialReceipt={lastReceipt}
                isActing={isActing}
              />
            ) : null}

            {viewMode === 'lab' && simData ? (
              <div className={styles.labCard}>
                <h2>Where time is lost</h2>
                <p>
                  Replays one recorded case that went wrong through the current process and a
                  proposed one, so the difference is measured rather than argued. Nothing here is
                  sent to the simulator.
                </p>
                {simData.caseSnapshot ? (
                  <ProtocolLab caseId={simData.caseSnapshot.case.caseId} />
                ) : (
                  <p>Waiting for the case to open before the comparison can run.</p>
                )}
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
