import { describe, expect, it } from 'vitest'
import type { SimResource } from '@/ctl/contracts'
import {
  detectAwaitingResult,
  detectOverdueTasks,
  detectStalledLoops,
  detectUnacceptedReferrals,
  detectUndispensedPrescriptions,
  detectUnansweredRequests,
  detectUnprocessedHandovers,
  runDetectors,
  summariseFindings,
} from '@/ctl/detect/detectors'
import {
  allResources,
  findResource,
  fixtureNow,
  fixtureScanWindow,
  gpResources,
  hospitalResources,
  referralsResources,
} from '../fixtures'

function resourceIds(resources: SimResource[]): Set<string> {
  return new Set(resources.map((resource) => resource.id))
}

/**
 * A test order with a request time. The detector compares report times against
 * that request time, so an order without one is unjudgeable and never fires.
 */
function awaitingOrder(): SimResource {
  return {
    id: 'fixture-order',
    kind: 'genomic-test',
    title: 'Panel test awaiting result',
    status: 'open',
    version: 1,
    visibleTo: ['hospital'],
    data: {},
    site: 'hospital',
    patientId: 'SIM-NO-RESULTS',
    createdAt: fixtureNow() - 3_600_000,
    provenance: { changes: [] },
  }
}

function sourcePriority(
  finding: { priority?: string; citations: { resourceId: string }[] },
  resources: SimResource[],
): string | undefined {
  const source = resources.find((resource) => resource.id === finding.citations[0]?.resourceId)
  return source?.priority
}

describe('detectors on live fixtures', () => {
  const now = fixtureNow()
  const resources = allResources()

  it('detectOverdueTasks fires on r-2 and not on future-due tasks', () => {
    const findings = detectOverdueTasks(resources, now)
    expect(findings.some((finding) => finding.citations[0]?.resourceId === 'r-2')).toBe(true)
    expect(findings.every((finding) => finding.detector === 'overdue-task')).toBe(true)

    const futureTask = findResource('r-120', resources)
    expect(futureTask).toBeDefined()
    expect(detectOverdueTasks([futureTask!], now)).toHaveLength(0)
  })

  it('detectUnprocessedHandovers fires on sent discharge summaries without review/file', () => {
    const findings = detectUnprocessedHandovers(hospitalResources(), now)
    expect(findings.some((finding) => finding.citations[0]?.resourceId === 'discharge-summary-example')).toBe(
      true,
    )

    const reviewed = hospitalResources().find(
      (resource) =>
        resource.kind === 'discharge-summary' &&
        resource.provenance.changes.some((entry) => entry.action === 'review'),
    )
    if (reviewed) {
      expect(detectUnprocessedHandovers([reviewed], now)).toHaveLength(0)
    }
  })

  it('detectUnacceptedReferrals fires on open past-due referrals without accept', () => {
    const findings = detectUnacceptedReferrals(referralsResources(), now)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.every((finding) => finding.detector === 'unaccepted-referral')).toBe(true)

    const accepted = referralsResources().find((resource) =>
      resource.provenance.changes.some((entry) => entry.action === 'accept'),
    )
    if (accepted) {
      expect(detectUnacceptedReferrals([accepted], now)).toHaveLength(0)
    }
  })

  it('detectUndispensedPrescriptions fires on approved/open prescriptions without dispense/collect', () => {
    const findings = detectUndispensedPrescriptions(resources, now)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.every((finding) => finding.detector === 'undispensed-prescription')).toBe(true)
  })

  it('detectUnansweredRequests fires on open requests with empty provenance changes', () => {
    const findings = detectUnansweredRequests(gpResources(), now)
    expect(findings.some((finding) => finding.citations[0]?.resourceId === 'r-5')).toBe(true)
    expect(findings.some((finding) => finding.citations[0]?.resourceId === 'r-10')).toBe(true)
  })

  it('detectAwaitingResult fires on r-45, whose only reports predate the request', () => {
    const genomicTest = findResource('r-45', resources)
    expect(genomicTest).toBeDefined()
    const findings = detectAwaitingResult(resources, now)
    expect(resourceIds(resources)).toContain('r-45')
    expect(findings.some((finding) => finding.citations[0]?.resourceId === 'r-45')).toBe(true)
  })

  it('detectAwaitingResult fires when no report exists for the patient at all', () => {
    expect(detectAwaitingResult([awaitingOrder()], now)).toHaveLength(1)
  })

  it('detectAwaitingResult stops firing once a report is filed after the request', () => {
    const order = awaitingOrder()
    const report: SimResource = {
      id: 'fixture-report',
      kind: 'report',
      title: 'Panel result',
      status: 'completed',
      version: 1,
      visibleTo: ['hospital'],
      data: {},
      site: 'diagnostics',
      patientId: order.patientId,
      createdAt: (order.createdAt ?? 0) + 60_000,
      provenance: { changes: [] },
    }
    expect(detectAwaitingResult([order, report], now)).toHaveLength(0)
  })

  it('detectStalledLoops fires on real overdue resources with no post-deadline activity', () => {
    const findings = detectStalledLoops(resources, now)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.some((finding) => finding.detector === 'stalled-loop')).toBe(true)
  })
})

describe('detector purity and honesty', () => {
  const now = fixtureNow()
  const resources = allResources()

  it('returns deeply equal output for identical input', () => {
    const first = runDetectors(resources, now)
    const second = runDetectors(resources, now)
    expect(second).toEqual(first)
  })

  it('changes breach state predictably when now moves across dueAt', () => {
    const prescription: SimResource = {
      id: 'breach-fixture',
      kind: 'prescription',
      title: 'Breach fixture prescription',
      status: 'open',
      version: 1,
      visibleTo: ['pharmacy'],
      data: {},
      site: 'pharmacy',
      dueAt: 1_000_000,
      provenance: { changes: [] },
    }
    const beforeDue = detectUndispensedPrescriptions([prescription], prescription.dueAt! - 30 * 60 * 1000)
    const afterDue = detectUndispensedPrescriptions([prescription], prescription.dueAt! + 1)
    expect(beforeDue[0]?.breach).toBe('due-soon')
    expect(afterDue[0]?.breach).toBe('breached')
  })

  it('every finding cites a resource present in the input', () => {
    const findings = runDetectors(resources, now)
    const ids = resourceIds(resources)
    for (const finding of findings) {
      expect(finding.citations.length).toBeGreaterThan(0)
      for (const cite of finding.citations) {
        expect(ids.has(cite.resourceId)).toBe(true)
      }
    }
  })

  it('never assigns priority absent from the source resource', () => {
    const findings = runDetectors(resources, now)
    for (const finding of findings) {
      const sourcePriorityValue = sourcePriority(finding, resources)
      if (sourcePriorityValue === undefined) {
        expect(finding.priority).toBeUndefined()
      } else {
        expect(finding.priority).toBe(sourcePriorityValue)
      }
    }
  })

  it('summariseFindings uses the scan window denominator', () => {
    const findings = runDetectors(resources, now)
    const window = fixtureScanWindow()
    const rates = summariseFindings(findings, window)
    expect(rates).toHaveLength(4)
    for (const rate of rates) {
      expect(rate.denominator).toBe(window.scanned)
      expect(rate.numerator).toBeLessThanOrEqual(rate.denominator)
    }
  })
})

describe('runDetectors corpus counts', () => {
  it('records stable per-detector counts on the live fixture corpus', () => {
    const now = fixtureNow()
    const resources = allResources()
    const findings = runDetectors(resources, now)
    const byDetector = Object.fromEntries(
      [
        'overdue-task',
        'awaiting-result',
        'unprocessed-handover',
        'unaccepted-referral',
        'undispensed-prescription',
        'unanswered-request',
        'stalled-loop',
      ].map((detector) => [detector, findings.filter((finding) => finding.detector === detector).length]),
    )
    expect(byDetector).toMatchInlineSnapshot(`
      {
        "awaiting-result": 1,
        "overdue-task": 1,
        "stalled-loop": 31,
        "unaccepted-referral": 7,
        "unanswered-request": 2,
        "undispensed-prescription": 17,
        "unprocessed-handover": 37,
      }
    `)
  })
})
