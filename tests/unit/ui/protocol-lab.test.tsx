// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DISABLED_DEPLOY_REASON } from '@/api/contracts'
import { GovernanceGate } from '@/components/protocol-lab/GovernanceGate'
import { ProtocolLab } from '@/components/ProtocolLab'

const CLASSIFICATION = {
  rule: 'source-reference-range' as const,
  ruleText:
    'An analyte value lies outside the reference range supplied by the source laboratory (referenceLow..referenceHigh). No urgency, diagnosis or treatment is inferred.',
  analyteId: 'crp',
  analyteName: 'C-reactive protein',
  value: 5.6,
  unit: 'mg/L',
  referenceLow: 0,
  referenceHigh: 5,
  direction: 'above' as const,
}

const V3_TO_V4_DIFF = {
  receiverMode: 'ACCOUNTABLE_TEAM',
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty',
  exceptionRoute: 'duty-clinician-task',
  dedupeWindowMinutes: 60,
}

const baselineProtocol = {
  id: 'v3',
  supersedes: 'v2',
  receiverMode: 'NAMED_ACTOR' as const,
  ackDeadlineMinutes: 120,
  fallbackTeamId: 'hospital' as const,
  exceptionRoute: 'orderer-task' as const,
  dedupeWindowMinutes: 0,
  clinicalPolicyRefs: ['local-abnormal-result-policy-2026'],
  approval: { status: 'ACTIVE' as const, approvers: ['seed'], rollbackTarget: 'v2' },
}

const candidateProtocol = {
  id: 'v4',
  supersedes: 'v3',
  receiverMode: 'ACCOUNTABLE_TEAM' as const,
  ackDeadlineMinutes: 30,
  fallbackTeamId: 'gp-duty' as const,
  exceptionRoute: 'duty-clinician-task' as const,
  dedupeWindowMinutes: 60,
  clinicalPolicyRefs: ['local-abnormal-result-policy-2026'],
  approval: { status: 'PROPOSED' as const, approvers: [], rollbackTarget: 'v3' },
}

function caseState(overrides: Record<string, unknown> = {}) {
  return {
    caseId: 'case-after-hours-timeout',
    patientId: 'SIM-000001',
    sourceResultId: 'blood-v1-SIM-000001-crp-5',
    sourceResultVersion: 1,
    sourceClassification: CLASSIFICATION,
    orderingTeamId: 'hospital',
    currentAccountableOwner: { teamId: 'hospital' },
    requestedReceiver: 'gp',
    acceptingActor: null,
    protocolVersion: 'v3',
    ownershipState: 'OVERDUE',
    closureState: 'PATIENT_INFORMED',
    submissionState: 'EVIDENCED',
    deadlines: { ackDeadlineAt: null },
    evidenceRefs: [],
    exceptionsEmitted: ['timeout-exception'],
    duplicateSuppressed: 0,
    manualChases: 2,
    eventLog: [],
    ...overrides,
  }
}

function demoResult(overrides: Record<string, unknown> = {}) {
  return {
    comparison: {
      baseline: {
        protocolId: 'v3',
        metrics: {
          acceptedOwnerLatencyMin: 240,
          ordererUnacceptedMinutes: 240,
          timeToClinicalReviewMin: 10,
          timeToPatientContactMin: 275,
          timeToActionEvidenceMin: null,
          timeToOutcomeEvidenceMin: null,
          manualChases: 2,
          duplicateAlerts: 8,
          timeouts: 1,
          reopens: 0,
        },
        invariants: [
          { id: 2, name: 'Always-owned owner', passed: true, detail: 'Owner team remained hospital' },
          { id: 10, name: 'Candidate burden', passed: true, detail: 'Burden not worse than baseline' },
        ],
        finalState: caseState({
          protocolVersion: 'v3',
          ownershipState: 'OVERDUE',
          closureState: 'PATIENT_INFORMED',
          currentAccountableOwner: { teamId: 'hospital' },
        }),
      },
      candidate: {
        protocolId: 'v4',
        metrics: {
          acceptedOwnerLatencyMin: 25,
          ordererUnacceptedMinutes: 25,
          timeToClinicalReviewMin: 10,
          timeToPatientContactMin: 275,
          timeToActionEvidenceMin: null,
          timeToOutcomeEvidenceMin: null,
          manualChases: 2,
          duplicateAlerts: 0,
          timeouts: 0,
          reopens: 0,
        },
        invariants: [
          { id: 2, name: 'Always-owned owner', passed: true, detail: 'Owner team remained hospital then gp' },
          { id: 10, name: 'Candidate burden', passed: true, detail: 'Fewer timeouts and duplicate alerts' },
        ],
        finalState: caseState({
          protocolVersion: 'v4',
          ownershipState: 'ACCEPTED',
          closureState: 'PATIENT_INFORMED',
          currentAccountableOwner: { teamId: 'gp', actorId: 'gp-duty-1' },
          exceptionsEmitted: [],
          manualChases: 2,
        }),
      },
      deltas: {
        acceptedOwnerLatencyMin: -215,
        ordererUnacceptedMinutes: -215,
        timeToClinicalReviewMin: 0,
        timeToPatientContactMin: 0,
        timeToActionEvidenceMin: null,
        timeToOutcomeEvidenceMin: null,
        manualChases: 0,
        duplicateAlerts: -8,
        timeouts: -1,
        reopens: 0,
      },
      candidateStatus: 'PASSED',
      sameTrace: true,
    },
    patch: {
      baseProtocolId: 'v3',
      diff: V3_TO_V4_DIFF,
      traceRef: 'after-hours-timeout',
      denominator: { traces: 1, events: 30 },
      failureHypothesis:
        'Named actor was unavailable after hours; the acknowledgement deadline elapsed and exception tasks repeated.',
      requestedTwinRun: true,
    },
    baselineProtocol,
    candidateProtocol,
    candidateStatus: 'PROPOSED',
    disabledDeployReason: DISABLED_DEPLOY_REASON,
    label: 'simulator regression evidence',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Protocol Lab', () => {
  it('renders the failed trace summary and failure hypothesis from the result', () => {
    const result = demoResult()
    render(<ProtocolLab caseId="case-after-hours-timeout" result={result} />)

    expect(screen.getByText('after-hours-timeout')).toBeTruthy()
    expect(
      screen.getByText(
        'Named actor was unavailable after hours; the acknowledgement deadline elapsed and exception tasks repeated.',
      ),
    ).toBeTruthy()
  })

  it('renders a compact diff table of only changed grammar fields from baseline to candidate', () => {
    render(<ProtocolLab caseId="case-after-hours-timeout" result={demoResult()} />)

    const table = screen.getByRole('table', { name: 'Changed protocol fields' })
    expect(within(table).getByRole('columnheader', { name: 'Field' })).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: 'Baseline' })).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: 'Candidate' })).toBeTruthy()

    expect(within(table).getByRole('row', { name: /receiverMode NAMED_ACTOR ACCOUNTABLE_TEAM/ })).toBeTruthy()
    expect(within(table).getByRole('row', { name: /ackDeadlineMinutes 120 30/ })).toBeTruthy()
    expect(within(table).getByRole('row', { name: /fallbackTeamId hospital gp-duty/ })).toBeTruthy()
    expect(within(table).getByRole('row', { name: /exceptionRoute orderer-task duty-clinician-task/ })).toBeTruthy()
    expect(within(table).getByRole('row', { name: /dedupeWindowMinutes 0 60/ })).toBeTruthy()
    expect(within(table).queryByText('clinicalPolicyRefs')).toBeNull()
  })

  it('renders side-by-side state tracks for the same replayed trace', () => {
    render(<ProtocolLab caseId="case-after-hours-timeout" result={demoResult()} />)

    const baseline = screen.getByRole('list', { name: 'Baseline v3' })
    const candidate = screen.getByRole('list', { name: 'Candidate v4' })

    expect(within(baseline).getByText(/OVERDUE/)).toBeTruthy()
    expect(within(baseline).getByText(/hospital/)).toBeTruthy()
    expect(within(candidate).getByText(/ACCEPTED/)).toBeTruthy()
    expect(within(candidate).getByText(/gp/)).toBeTruthy()
    expect(screen.getByText(/same immutable trace/i)).toBeTruthy()
  })

  it('renders comparison metric values from comparison.deltas', () => {
    const result = demoResult()
    render(<ProtocolLab caseId="case-after-hours-timeout" result={result} />)

    const table = screen.getByRole('table', { name: 'Comparison metrics' })
    expect(within(table).getByRole('columnheader', { name: 'Metric' })).toBeTruthy()
    expect(within(table).getByRole('columnheader', { name: 'Delta' })).toBeTruthy()
    expect(within(table).getByRole('row', { name: /acceptedOwnerLatencyMin -215/ })).toBeTruthy()
    expect(within(table).getByRole('row', { name: /duplicateAlerts -8/ })).toBeTruthy()
    expect(within(table).getByRole('row', { name: /timeouts -1/ })).toBeTruthy()
  })

  it('renders invariant rows with pass and fail text and icon', () => {
    const result = demoResult({
      comparison: {
        ...demoResult().comparison,
        candidate: {
          ...demoResult().comparison.candidate,
          invariants: [
            { id: 2, name: 'Always-owned owner', passed: true, detail: 'Owner remained present' },
            { id: 12, name: 'Activation gate', passed: false, detail: 'Candidate is not ACTIVE' },
          ],
        },
      },
    })
    render(<ProtocolLab caseId="case-after-hours-timeout" result={result} />)

    const passed = screen.getByText('Always-owned owner').closest('li')
    const failed = screen.getByText('Activation gate').closest('li')
    expect(passed?.textContent).toMatch(/pass/)
    expect(passed?.querySelector('[aria-hidden="true"]')?.textContent).toBe('✓')
    expect(failed?.textContent).toMatch(/fail/)
    expect(failed?.querySelector('[aria-hidden="true"]')?.textContent).toBe('✗')
  })

  it('renders the evidence denominator from the patch', () => {
    render(<ProtocolLab caseId="case-after-hours-timeout" result={demoResult()} />)
    expect(screen.getByText('traces: 1, events: 30')).toBeTruthy()
  })

  it('shows the candidate status badge as PROPOSED', () => {
    render(<ProtocolLab caseId="case-after-hours-timeout" result={demoResult()} />)
    expect(screen.getByText('PROPOSED')).toBeTruthy()
  })

  it('renders Approve and Deploy disabled with aria-describedby pointing at the verbatim reason', () => {
    render(<ProtocolLab caseId="case-after-hours-timeout" result={demoResult()} />)

    const approve = screen.getByRole('button', { name: 'Approve' })
    const deploy = screen.getByRole('button', { name: 'Deploy' })
    expect(approve).toHaveProperty('disabled', true)
    expect(deploy).toHaveProperty('disabled', true)

    const describedBy = approve.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(describedBy).toBe(deploy.getAttribute('aria-describedby'))
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(DISABLED_DEPLOY_REASON)
  })

  it('shows the rollback target', () => {
    render(<ProtocolLab caseId="case-after-hours-timeout" result={demoResult()} />)
    expect(screen.getByText(/rollback target:\s*v3/i)).toBeTruthy()
  })

  it('labels the evidence block simulator regression evidence', () => {
    render(<ProtocolLab caseId="case-after-hours-timeout" result={demoResult()} />)
    expect(screen.getByRole('region', { name: 'simulator regression evidence' })).toBeTruthy()
  })

  it('posts TwinRequest with the v3 to v4 diff when Test patch is pressed', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/case/case-after-hours-timeout/twin')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        traceId: 'after-hours-timeout',
        baseProtocolId: 'v3',
        diff: V3_TO_V4_DIFF,
      })
      return new Response(JSON.stringify(demoResult()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const globalFetch = vi.fn()
    vi.stubGlobal('fetch', globalFetch)

    render(<ProtocolLab caseId="case-after-hours-timeout" fetchImpl={fetchImpl} />)
    fireEvent.click(screen.getByRole('button', { name: 'Test patch' }))

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
    expect(globalFetch).not.toHaveBeenCalled()
    expect(await screen.findByRole('region', { name: 'simulator regression evidence' })).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('renders unusual prop values exactly, proving presentation is not hard-coded', () => {
    const unusual = demoResult({
      patch: {
        baseProtocolId: 'v9',
        diff: { ackDeadlineMinutes: 17 },
        traceRef: 'trace-UNUSUAL-ZX',
        denominator: { traces: 9, events: 404 },
        failureHypothesis: 'UNUSUAL_HYPOTHESIS_ZX',
        requestedTwinRun: true,
      },
      comparison: {
        ...demoResult().comparison,
        sameTrace: true,
        deltas: { widgetLatency: 777, zebraCount: -3 },
        baseline: {
          ...demoResult().comparison.baseline,
          protocolId: 'base-UNUSUAL',
          finalState: caseState({
            ownershipState: 'STALE',
            closureState: 'REOPENED',
            currentAccountableOwner: { teamId: 'community' },
          }),
        },
        candidate: {
          ...demoResult().comparison.candidate,
          protocolId: 'cand-UNUSUAL',
          invariants: [{ id: 42, name: 'INVARIANT_Q', passed: false, detail: 'DETAIL_Q' }],
          finalState: caseState({
            ownershipState: 'DECLINED',
            closureState: 'ACTION_MISSED',
            currentAccountableOwner: { teamId: 'pharmacy' },
          }),
        },
      },
      baselineProtocol: {
        ...baselineProtocol,
        id: 'base-UNUSUAL',
        receiverMode: 'NAMED_ACTOR',
        ackDeadlineMinutes: 11,
        fallbackTeamId: 'community',
        exceptionRoute: 'orderer-task',
        dedupeWindowMinutes: 2,
        clinicalPolicyRefs: ['clinical-A'],
      },
      candidateProtocol: {
        ...candidateProtocol,
        id: 'cand-UNUSUAL',
        receiverMode: 'NAMED_ACTOR',
        ackDeadlineMinutes: 22,
        fallbackTeamId: 'pharmacy',
        exceptionRoute: 'orderer-task',
        dedupeWindowMinutes: 2,
        clinicalPolicyRefs: ['clinical-B'],
        approval: { status: 'PROPOSED', approvers: [], rollbackTarget: 'rb-unusual' },
      },
      candidateStatus: 'PROPOSED',
      disabledDeployReason: 'UNUSUAL_REASON_NO_DEPLOY',
      label: 'simulator regression evidence',
    })

    render(<ProtocolLab caseId="case-unusual" result={unusual} />)

    expect(screen.getByText('UNUSUAL_HYPOTHESIS_ZX')).toBeTruthy()
    expect(screen.getByText('trace-UNUSUAL-ZX')).toBeTruthy()
    expect(screen.getByText('traces: 9, events: 404')).toBeTruthy()
    expect(screen.getByText('UNUSUAL_REASON_NO_DEPLOY')).toBeTruthy()
    expect(screen.getByText(/rb-unusual/)).toBeTruthy()

    const metrics = screen.getByRole('table', { name: 'Comparison metrics' })
    expect(within(metrics).getByRole('row', { name: /widgetLatency 777/ })).toBeTruthy()
    expect(within(metrics).getByRole('row', { name: /zebraCount -3/ })).toBeTruthy()
    expect(within(metrics).queryByText('-215')).toBeNull()

    const diff = screen.getByRole('table', { name: 'Changed protocol fields' })
    expect(within(diff).getByRole('row', { name: /ackDeadlineMinutes 11 22/ })).toBeTruthy()
    expect(within(diff).getByRole('row', { name: /fallbackTeamId community pharmacy/ })).toBeTruthy()
    expect(within(diff).queryByText('receiverMode')).toBeNull()
    expect(within(diff).queryByText('dedupeWindowMinutes')).toBeNull()

    expect(screen.getByText('INVARIANT_Q')).toBeTruthy()
    expect(screen.getByText('DETAIL_Q')).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Baseline base-UNUSUAL' })).getByText(/STALE/)).toBeTruthy()
    expect(within(screen.getByRole('list', { name: 'Candidate cand-UNUSUAL' })).getByText(/DECLINED/)).toBeTruthy()
  })

  it('never lists clinical meaning fields as changeable in the diff', () => {
    const result = demoResult({
      baselineProtocol: {
        ...baselineProtocol,
        clinicalPolicyRefs: ['never-patch-this'],
      },
      candidateProtocol: {
        ...candidateProtocol,
        clinicalPolicyRefs: ['also-never-patch-this'],
      },
    })
    render(<ProtocolLab caseId="case-after-hours-timeout" result={result} />)

    const diff = screen.getByRole('table', { name: 'Changed protocol fields' })
    expect(within(diff).queryByText(/clinical/i)).toBeNull()
    expect(within(diff).queryByText(/urgency/i)).toBeNull()
    expect(within(diff).queryByText(/abnormality/i)).toBeNull()
    expect(within(diff).queryByText(/diagnosis/i)).toBeNull()
    expect(within(diff).queryByText(/threshold/i)).toBeNull()
  })

  it('renders an honest error state when the twin request fails', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ error: 'twin-unavailable' }), { status: 503 })
    })

    render(<ProtocolLab caseId="case-after-hours-timeout" fetchImpl={fetchImpl} />)
    fireEvent.click(screen.getByRole('button', { name: 'Test patch' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/failed/i)
    expect(alert.textContent).not.toMatch(/improved/i)
    expect(screen.queryByRole('region', { name: 'simulator regression evidence' })).toBeNull()
  })
})

describe('GovernanceGate', () => {
  it('uses the imported disabled deploy reason when no reason prop is provided', () => {
    render(<GovernanceGate rollbackTarget="v3" />)
    const deploy = screen.getByRole('button', { name: 'Deploy' })
    const describedBy = deploy.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(DISABLED_DEPLOY_REASON)
  })
})
