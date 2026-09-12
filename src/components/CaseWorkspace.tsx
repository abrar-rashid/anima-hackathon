'use client'

import { useMemo, useState } from 'react'
import { hashProposal } from '@/services/proposal-hash'
import { CaseHeader } from './CaseHeader'
import { CovenantGraph, type CovenantGraphTrack } from './CovenantGraph'
import { EvidencePane } from './EvidencePane'
import { LiveRegion } from './LiveRegion'
import { ProposalPane, type ProposalActionView, type ProposalStaff } from './ProposalPane'
import { ProtocolLab } from './ProtocolLab'
import { ReceiptPane, type ReceiptRowView } from './ReceiptPane'
import { TechnicalDetails } from './TechnicalDetails'
import styles from './case-workspace.module.css'

export type CaseWorkspaceStaff = ProposalStaff & { attribution?: 'app-side' }

export type CaseWorkspaceProposal = {
  transfer: { toTeam: string; mode: string; toActorId?: string }
  deadlines: { ackDeadlineAt: number | null; policySource: string }
  actions: ProposalActionView[]
  prohibited: { field: string; reason: string }[]
  hardStops: string[]
  fieldSources?: Record<string, string>
}

export type CaseWorkspaceCase = {
  caseId: string
  patientId: string
  sourceResultId: string
  sourceResultVersion: number
  sourceClassification: {
    ruleText: string
    analyteName: string
    value: number
    unit: string
    referenceLow: number
    referenceHigh: number
    direction: 'above' | 'below'
  }
  orderingTeamId: string
  currentAccountableOwner: { teamId: string; actorId?: string }
  requestedReceiver: string | null
  acceptingActor: { name: string } | null
  protocolVersion: string
  ownershipState: string
  closureState: string
  submissionState: string
  evidenceRefs: {
    site: string
    resourceId: string
    resourceVersion: number
    observedAtSimulatorTime: number
    eventType: string
    activityId?: string
  }[]
  eventLog: { actor: string; simulatorTime?: number; event: { type: string } }[]
}

export type CaseWorkspaceSnapshot = {
  case: CaseWorkspaceCase
  protocol: { id: string }
  snapshot: {
    visibility: string[]
    missingEvidence: string[]
    conflicts: string[]
    existingTasks: { id: string; version: number; title: string; status: string }[]
    citations?: CaseWorkspaceCase['evidenceRefs']
  } | null
  proposal: CaseWorkspaceProposal | null
  connection: {
    live: boolean
    world: string
    simulatorNow: number
    acceptSupported: boolean | null
  }
  eligibility: { ruleText: string }
  replay: { label: 'Recorded simulator replay'; world: string; capturedAt: string } | null
  staffRoster?: CaseWorkspaceStaff[]
}

export type ApproveResultView = {
  receipts: ReceiptRowView[]
  case: CaseWorkspaceCase
  hardStops: string[]
}

export type CaseWorkspaceProps = {
  snapshot: CaseWorkspaceSnapshot
  patientName: string
}

function ownershipActive(state: string): string {
  if (state === 'ACCEPTED') return 'ACCEPTED'
  if (
    state === 'TRANSFER_REQUESTED' ||
    state === 'DECLINED' ||
    state === 'OVERDUE' ||
    state === 'OWNER_UNAVAILABLE'
  ) {
    return 'TRANSFER_REQUESTED'
  }
  return 'ORDERER_OWNS'
}

function careActive(state: string): string {
  const map: Record<string, string> = {
    RESULT_AVAILABLE: 'RESULT_AVAILABLE',
    CLINICALLY_REVIEWED: 'CLINICALLY_REVIEWED',
    PLAN_RECORDED: 'PLAN_RECORDED',
    PATIENT_INFORMED: 'PATIENT_INFORMED',
    ACTION_STARTED: 'ACTION_STARTED',
    OUTCOME_EVIDENCED: 'OUTCOME_EVIDENCED',
    CLOSED: 'CLOSED',
    PATIENT_UNREACHED: 'PATIENT_INFORMED',
    ACTION_NOT_BOOKED: 'ACTION_STARTED',
    ACTION_MISSED: 'ACTION_STARTED',
    PLAN_CHANGED: 'PLAN_RECORDED',
    EVIDENCE_LATE: 'OUTCOME_EVIDENCED',
    REOPENED: 'RESULT_AVAILABLE',
  }
  return map[state] ?? 'RESULT_AVAILABLE'
}

function buildTracks(record: CaseWorkspaceCase): CovenantGraphTrack[] {
  const ownerActive = ownershipActive(record.ownershipState)
  const careId = careActive(record.closureState)
  const source = {
    recordId: record.sourceResultId,
    version: record.sourceResultVersion,
    actor: record.eventLog[0]?.actor ?? record.orderingTeamId,
    event: record.eventLog[0]?.event.type ?? 'ResultAvailable',
  }
  return [
    {
      id: 'ownership',
      label: 'Ownership',
      nodes: [
        { id: 'ORDERER_OWNS', label: 'Orderer owns', icon: '●', active: ownerActive === 'ORDERER_OWNS', source },
        { id: 'TRANSFER_REQUESTED', label: 'Transfer requested', icon: '→', active: ownerActive === 'TRANSFER_REQUESTED' },
        { id: 'ACCEPTED', label: 'Accepted owner', icon: '✓', active: ownerActive === 'ACCEPTED' },
      ],
    },
    {
      id: 'care',
      label: 'Care',
      nodes: [
        { id: 'RESULT_AVAILABLE', label: 'Result available', icon: '●', active: careId === 'RESULT_AVAILABLE', source },
        { id: 'CLINICALLY_REVIEWED', label: 'Reviewed', icon: '▣', active: careId === 'CLINICALLY_REVIEWED' },
        { id: 'PLAN_RECORDED', label: 'Plan recorded', icon: '✎', active: careId === 'PLAN_RECORDED' },
        { id: 'PATIENT_INFORMED', label: 'Patient informed', icon: '✉', active: careId === 'PATIENT_INFORMED' },
        { id: 'ACTION_STARTED', label: 'Action started', icon: '▸', active: careId === 'ACTION_STARTED' },
        { id: 'OUTCOME_EVIDENCED', label: 'Outcome evidenced', icon: '✓', active: careId === 'OUTCOME_EVIDENCED' },
        { id: 'CLOSED', label: 'Closed', icon: '■', active: careId === 'CLOSED' },
      ],
    },
  ]
}

function announceReceipts(receipts: ReceiptRowView[]): string {
  const statuses = receipts.map((row) => row.status)
  if (statuses.includes('EVIDENCED')) return 'Readback: Activity evidence recorded for this action.'
  if (statuses.includes('ACCEPTED')) return 'Readback: acceptance recorded. Activity evidence is not yet confirmed.'
  if (statuses.includes('VISIBLE_DOWNSTREAM')) {
    return 'Readback: action is visible downstream. Activity evidence is not yet confirmed.'
  }
  if (statuses.includes('SUBMITTED')) {
    return 'Write submitted. Destination visibility and Activity evidence are not yet confirmed.'
  }
  if (statuses.includes('FAILED')) return 'Write failed. No completion is claimed.'
  if (statuses.includes('STALE')) return 'Proposal is stale. No write was sent.'
  if (statuses.includes('DUPLICATE_LINKED')) {
    return 'Duplicate linked to an existing receipt. No new write was created.'
  }
  return ''
}

function payloadResourceId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const id = (payload as { resourceId?: unknown }).resourceId
  return typeof id === 'string' && id.trim().length > 0 ? id : undefined
}

function normalizeProposal(proposal: CaseWorkspaceProposal, acceptSupported: boolean | null): CaseWorkspaceProposal {
  return {
    ...proposal,
    actions: proposal.actions.map((action) => {
      if (action.kind === 'accept' && acceptSupported !== true) {
        return { ...action, supported: false, label: 'Protocol preview' }
      }
      if (action.kind === 'accept' && acceptSupported === true) {
        const taskId = payloadResourceId(action.payload)
        return {
          ...action,
          supported: true,
          label: 'live',
          requiresSeparateApproval: true,
          blockedReason:
            action.blockedReason ??
            (taskId
              ? undefined
              : 'Task id is not yet known. Accept becomes executable after the ordering team creates the transfer task and a receipt or readback returns its id.'),
        }
      }
      return action
    }),
  }
}

export function CaseWorkspace({ snapshot, patientName }: CaseWorkspaceProps) {
  const [current, setCurrent] = useState(snapshot)
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<ReceiptRowView[] | null>(null)
  const [liveMessage, setLiveMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const proposal = useMemo(
    () => (current.proposal ? normalizeProposal(current.proposal, current.connection.acceptSupported) : null),
    [current],
  )
  const staffRoster = current.staffRoster ?? []
  const auditEvent =
    current.case.eventLog.find((entry) => entry.event.type === 'ActivityEvidenced') ??
    current.case.eventLog.find((entry) => entry.event.type === 'ActionSubmitted')
  const classification = current.case.sourceClassification
  const owner = current.case.currentAccountableOwner.teamId
  const evidence = current.snapshot

  async function approve(actionIndexes: number[]) {
    const staff = staffRoster.find((row) => row.id === selectedStaffId)
    if (!proposal || !staff) return
    setError(null)
    try {
      const response = await fetch(`/api/case/${current.case.caseId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposalHash: hashProposal(proposal),
          approverId: staff.id,
          staff,
          actionIndexes,
        }),
      })
      if (!response.ok) {
        setLiveMessage('Approval request failed. No new write is assumed.')
        setError('The approve request did not succeed. No completion is claimed.')
        return
      }
      const result = (await response.json()) as ApproveResultView
      setReceipts(result.receipts)
      setSelectedStaffId(null)
      setCurrent((prev) => ({
        ...prev,
        case: result.case,
        proposal: result.hardStops.length > 0 && prev.proposal
          ? { ...prev.proposal, hardStops: result.hardStops }
          : prev.proposal,
      }))
      setLiveMessage(announceReceipts(result.receipts))
      try {
        const compiled = await fetch(`/api/case/${current.case.caseId}/compile`, { method: 'POST' })
        if (compiled.ok) {
          const data = (await compiled.json()) as Partial<CaseWorkspaceSnapshot>
          setCurrent((prev) => ({
            ...prev,
            ...data,
            case: data.case ?? prev.case,
            protocol: data.protocol ?? prev.protocol,
            proposal: data.proposal ?? prev.proposal,
            snapshot: data.snapshot ?? prev.snapshot,
            connection: data.connection ?? prev.connection,
            eligibility: data.eligibility ?? prev.eligibility,
            replay: data.replay === undefined ? prev.replay : data.replay,
            staffRoster: data.staffRoster ?? prev.staffRoster,
          }))
        }
      } catch {
        // Keep the approve result. The second step stays blocked until compile succeeds.
      }
    } catch {
      setLiveMessage('Approval request failed. No new write is assumed.')
      setError('The approve request did not reach the server. No write is assumed.')
    }
  }

  async function refreshCase() {
    setError(null)
    try {
      const response = await fetch(`/api/case/${current.case.caseId}/refresh`, { method: 'POST' })
      if (!response.ok) {
        setLiveMessage('Refresh failed. Previous evidence is unchanged.')
        setError('The case could not be refreshed. Earlier evidence is left as last returned.')
        return
      }
      const data = (await response.json()) as Partial<CaseWorkspaceSnapshot> & { receipts?: ReceiptRowView[] }
      setCurrent((prev) => ({
        ...prev,
        ...data,
        case: data.case ?? prev.case,
        protocol: data.protocol ?? prev.protocol,
        proposal: data.proposal ?? prev.proposal,
        snapshot: data.snapshot ?? prev.snapshot,
        connection: data.connection ?? prev.connection,
        eligibility: data.eligibility ?? prev.eligibility,
        replay: data.replay === undefined ? prev.replay : data.replay,
        staffRoster: data.staffRoster ?? prev.staffRoster,
      }))
      if (Array.isArray(data.receipts)) {
        setReceipts(data.receipts)
        setLiveMessage(announceReceipts(data.receipts))
      }
    } catch {
      setLiveMessage('Refresh failed. Previous evidence is unchanged.')
      setError('The case could not be refreshed. Earlier evidence is left as last returned.')
    }
  }

  async function reloadCase() {
    setError(null)
    try {
      const response = await fetch('/api/case/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ patientId: current.case.patientId }),
      })
      if (!response.ok) {
        setLiveMessage('Reload failed. Previous evidence is unchanged.')
        setError('The case could not be reloaded. No write was sent.')
        return
      }
      const data = (await response.json()) as CaseWorkspaceSnapshot
      setCurrent(data)
      setReceipts(null)
      setLiveMessage('Case reloaded from the current server snapshot.')
    } catch {
      setLiveMessage('Reload failed. Previous evidence is unchanged.')
      setError('The case could not be reloaded. No write was sent.')
    }
  }

  return (
    <div className={styles.workspace}>
      <CaseHeader
        patientName={patientName}
        patientId={current.case.patientId}
        resultId={current.case.sourceResultId}
        resultVersion={current.case.sourceResultVersion}
        classificationRuleText={current.eligibility.ruleText}
        analyteName={classification.analyteName}
        value={classification.value}
        unit={classification.unit}
        referenceLow={classification.referenceLow}
        referenceHigh={classification.referenceHigh}
        direction={classification.direction}
        orderingTeamId={current.case.orderingTeamId}
        currentAccountableOwner={owner}
        requestedReceiver={current.case.requestedReceiver}
        acceptingActorName={current.case.acceptingActor?.name ?? null}
        simulatorNow={current.connection.simulatorNow}
        protocolId={current.protocol.id}
        connectionLive={current.connection.live}
        replay={current.replay}
      />
      <div className={styles.toolbar}>
        <button type="button" className={styles.ghost} onClick={() => void reloadCase()}>
          Reload case
        </button>
        <button type="button" className={styles.ghost} onClick={() => void refreshCase()}>
          Refresh case
        </button>
      </div>
      {error ? (
        <p className={styles.fail} role="alert">
          {error}
        </p>
      ) : null}
      <CovenantGraph tracks={buildTracks(current.case)} currentOwner={owner} />
      <div className={styles.columns}>
        <EvidencePane
          analyteName={classification.analyteName}
          value={classification.value}
          unit={classification.unit}
          referenceLow={classification.referenceLow}
          referenceHigh={classification.referenceHigh}
          direction={classification.direction}
          ruleText={current.eligibility.ruleText}
          resultId={current.case.sourceResultId}
          resultVersion={current.case.sourceResultVersion}
          visibility={evidence?.visibility ?? []}
          citations={evidence?.citations ?? current.case.evidenceRefs}
          missingEvidence={evidence?.missingEvidence ?? []}
          conflicts={evidence?.conflicts ?? []}
          existingTasks={evidence?.existingTasks ?? []}
        />
        <div className={styles.stack}>
          {receipts ? (
            <ReceiptPane
              receipts={receipts}
              currentOwner={owner}
              nextSafeAction="Refresh the destination readback"
            />
          ) : null}
          {proposal ? (
            <ProposalPane
              currentOwner={owner}
              nextOwner={proposal.transfer.toTeam}
              orderingTeamId={current.case.orderingTeamId}
              requestedReceiver={current.case.requestedReceiver}
              transfer={proposal.transfer}
              deadlines={proposal.deadlines}
              actions={proposal.actions}
              prohibited={proposal.prohibited}
              hardStops={proposal.hardStops}
              staffRoster={staffRoster}
              selectedStaffId={selectedStaffId}
              onStaffChange={(id) => setSelectedStaffId(id || null)}
              onApprove={(indexes) => void approve(indexes)}
            />
          ) : receipts ? null : (
            <section className={styles.panel}>
              <h2>Proposed covenant</h2>
              <p>No proposal is available. The case can still be inspected from returned evidence.</p>
            </section>
          )}
        </div>
      </div>
      <TechnicalDetails
        caseId={current.case.caseId}
        resultId={current.case.sourceResultId}
        resultVersion={current.case.sourceResultVersion}
        activityLinks={(receipts ?? [])
          .filter((row) => row.activityId)
          .map((row) => ({ activityId: row.activityId as string, label: `action ${row.actionIndex}` }))}
        activityActor={auditEvent?.actor}
        activityTime={auditEvent?.simulatorTime}
        payload={proposal?.actions[0]?.payload}
        stages={['open', receipts ? 'approved' : 'proposed', 'readback']}
      />
      <ProtocolLab caseId={current.case.caseId} />
      <LiveRegion message={liveMessage} />
    </div>
  )
}
