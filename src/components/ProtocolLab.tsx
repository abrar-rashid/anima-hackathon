'use client'

import { useState, type ReactNode } from 'react'
import { DISABLED_DEPLOY_REASON, GovernanceGate } from './protocol-lab/GovernanceGate'
import { InvariantList } from './protocol-lab/InvariantList'
import { ProtocolDiff, type ProtocolDiffFields } from './protocol-lab/ProtocolDiff'
import { TwinComparison, type TrackState } from './protocol-lab/TwinComparison'
import styles from './protocol-lab/protocol-lab.module.css'

export const V3_TO_V4_DIFF = {
  receiverMode: 'ACCOUNTABLE_TEAM',
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty',
  exceptionRoute: 'duty-clinician-task',
  dedupeWindowMinutes: 60,
} as const

export const DEFAULT_TWIN_REQUEST = {
  traceId: 'after-hours-timeout' as const,
  baseProtocolId: 'v3',
  diff: V3_TO_V4_DIFF,
}

export type TwinFetch = (url: string, init?: RequestInit) => Promise<Response>

export type TwinResultView = {
  comparison: {
    baseline: {
      protocolId: string
      finalState: {
        ownershipState: string
        closureState: string
        currentAccountableOwner: { teamId: string; actorId?: string }
      }
    }
    candidate: {
      protocolId: string
      finalState: {
        ownershipState: string
        closureState: string
        currentAccountableOwner: { teamId: string; actorId?: string }
      }
      invariants: Array<{ id: number; name: string; passed: boolean; detail: string }>
    }
    deltas: Record<string, number | null>
    sameTrace: boolean
  }
  patch: {
    traceRef: string
    denominator: { traces: number; events: number }
    failureHypothesis: string
  }
  baselineProtocol: ProtocolDiffFields
  candidateProtocol: ProtocolDiffFields & {
    approval: { rollbackTarget: string | null }
  }
  candidateStatus: string
  disabledDeployReason: string
  label: string
}

export function ProtocolLab({
  caseId,
  result: initialResult,
  fetchImpl,
  graph,
}: {
  caseId: string
  result?: TwinResultView
  fetchImpl?: TwinFetch
  graph?: (props: { label: string; state: TrackState }) => ReactNode
}) {
  const [result, setResult] = useState<TwinResultView | undefined>(initialResult)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onTestPatch() {
    setPending(true)
    setError(null)
    const request = fetchImpl ?? fetch
    try {
      const response = await request(`/api/case/${caseId}/twin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_TWIN_REQUEST),
      })
      if (!response.ok) {
        setError(`Twin request failed (${response.status}). Simulator evidence was not updated.`)
        return
      }
      const payload = (await response.json()) as TwinResultView
      setResult(payload)
    } catch {
      setError('Twin request failed. Simulator evidence was not updated.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className={styles.lab} aria-labelledby="protocol-lab-heading" aria-busy={pending}>
      <div className={styles.section}>
        <h2 className={styles.title} id="protocol-lab-heading">
          Protocol Lab
        </h2>
        <p className={styles.lede}>
          Replay one synthetic trace under the current and candidate operational protocol. Values
          come from the twin response, not from a claimed clinical outcome.
        </p>
      </div>

      {result ? (
        <section className={styles.section} aria-labelledby="failed-trace-heading">
          <h3 className={styles.sectionTitle} id="failed-trace-heading">
            Failed trace
          </h3>
          <dl className={styles.summary}>
            <dt>Trace</dt>
            <dd>{result.patch.traceRef}</dd>
            <dt>Failure hypothesis</dt>
            <dd>{result.patch.failureHypothesis}</dd>
          </dl>
        </section>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.testPatch} onClick={() => void onTestPatch()} disabled={pending}>
          Test patch
        </button>
        {pending ? (
          <p className={styles.statusLine} role="status">
            Replaying the captured trace.
          </p>
        ) : null}
      </div>

      {error ? (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className={styles.evidence} aria-labelledby="simulator-regression-evidence-label">
          <div className={styles.evidenceHeader}>
            <h3 className={styles.sectionTitle} id="simulator-regression-evidence-label">
              {result.label}
            </h3>
            <p className={styles.badge}>
              <span aria-hidden="true">●</span>
              {result.candidateStatus}
            </p>
          </div>

          <ProtocolDiff baseline={result.baselineProtocol} candidate={result.candidateProtocol} />
          <TwinComparison
            baseline={result.comparison.baseline}
            candidate={result.comparison.candidate}
            deltas={result.comparison.deltas}
            sameTrace={result.comparison.sameTrace}
            graph={graph}
          />
          <InvariantList invariants={result.comparison.candidate.invariants} />
          <p>
            Denominator{' '}
            <span>{`traces: ${result.patch.denominator.traces}, events: ${result.patch.denominator.events}`}</span>
          </p>
          <GovernanceGate
            reason={result.disabledDeployReason ?? DISABLED_DEPLOY_REASON}
            rollbackTarget={result.candidateProtocol.approval.rollbackTarget}
          />
        </section>
      ) : null}
    </section>
  )
}
