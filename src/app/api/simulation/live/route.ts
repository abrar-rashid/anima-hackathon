import { NextResponse } from 'next/server'
import { getContainer } from '@/services/container'
import { createAnimaClient } from '@/adapters/anima/client'
import { bloodReportFrom } from '@/adapters/anima/mapping'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RawClockEvent {
  id?: string
  time?: number
  type?: string
  actor?: string
  detail?: string
  patientId?: string
  resourceId?: string
}

interface ClockBody {
  now?: number
  paused?: boolean
  speed?: number
  events?: RawClockEvent[]
}

const PATIENT_NAMES: Record<string, { name: string; age: number; gender: string }> = {
  'SIM-000001': { name: 'Amira Khan', age: 64, gender: 'Female' },
  'SIM-000006': { name: 'Eleanor Chen', age: 58, gender: 'Female' },
  'SIM-000007': { name: 'David Wilson', age: 71, gender: 'Male' },
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId') ?? 'SIM-000001'

    const container = getContainer()
    const clock = await container.clock.read()

    // Read live clock events if live mode
    let liveEvents: RawClockEvent[] = []
    if (container.live) {
      try {
        const client = createAnimaClient()
        const { status, body } = await client.request<ClockBody>('/api/clock')
        if (status === 200 && Array.isArray(body?.events)) {
          liveEvents = body.events.slice(0, 30)
        }
      } catch {
        // Fallback gracefully
      }
    }

    // Open/read the case snapshot for this patient
    let caseSnapshot
    try {
      caseSnapshot = await container.cases.open({ patientId })
    } catch {
      caseSnapshot = await container.cases.open({ patientId: 'SIM-000001' })
    }

    // Check if store has updated state after execution
    const storedCase = container.store.get(caseSnapshot.case.caseId)
    if (storedCase) {
      caseSnapshot.case = storedCase.case
    }

    // Also get patient EHR records
    const [gpRecords, _hospitalRecords, diagRecords] = await Promise.all([
      container.read.getSiteRecords('gp', patientId),
      container.read.getSiteRecords('hospital', patientId),
      container.read.getSiteRecords('diagnostics', patientId),
    ])

    // Extract problems from EHR
    const ehrRecord = gpRecords.items.find((r) => r.kind === 'ehr-record')
    const problems = (ehrRecord?.data as { problems?: Array<{ term: string; code: string; status: string; date: string }> })?.problems ?? [
      { term: 'Heart failure', code: 'SIM-PROBLEM-1', status: 'resolved', date: '2026-08-13' },
      { term: 'Chronic Kidney Disease (CKD Stage 3)', code: 'SIM-PROBLEM-2', status: 'active', date: '2026-05-15' },
    ]

    // Extract latest blood result
    const rawReport = diagRecords.items.find((r) => r.kind === 'report')
    const reportData = rawReport ? bloodReportFrom(rawReport) : null
    const crpAnalyte = reportData?.analytes?.find((a) => a.name.toLowerCase().includes('crp') || a.name.toLowerCase().includes('c-reactive'))
    const recentLab = {
      name: crpAnalyte ? crpAnalyte.name : 'C-reactive protein',
      value: crpAnalyte ? crpAnalyte.value : 5.6,
      unit: crpAnalyte ? crpAnalyte.unit : 'mg/L',
      refLow: crpAnalyte ? crpAnalyte.referenceLow : 0,
      refHigh: crpAnalyte ? crpAnalyte.referenceHigh : 5.0,
      isAbnormal: crpAnalyte ? (crpAnalyte.value < crpAnalyte.referenceLow || crpAnalyte.value > crpAnalyte.referenceHigh) : true,
    }

    // Extract recent observations (home monitor, etc.)
    const observations = liveEvents
      .filter((e) => e.patientId === patientId || e.type?.includes('observation'))
      .slice(0, 6)
      .map((e) => ({
        time: e.time ?? clock.now,
        type: e.type ?? 'observation',
        detail: e.detail ?? 'Home activity reading recorded',
      }))

    // Build the Team 12 task ledger rows
    const tasks = [
      {
        task_id: 'TASK-CRP-TRANSFER',
        episode_id: `EP-${patientId}-01`,
        timestamp: new Date(clock.now - 20 * 60 * 1000).toISOString(),
        title: 'Acknowledge abnormal CRP handover',
        status: caseSnapshot.case.ownershipState === 'ACCEPTED' ? 'COMPLETED' : 'OPEN',
        owner: caseSnapshot.case.currentAccountableOwner.teamId === 'hospital' ? 'St. Jude Hospital Acute Team' : 'High St GP Surgery',
        note: `Blood test result: CRP ${recentLab.value} ${recentLab.unit} exceeds reference range (${recentLab.refLow}-${recentLab.refHigh} ${recentLab.unit}). Accountability transfer to Duty GP required.`,
        deadline: new Date(clock.now + 30 * 60 * 1000).toISOString(),
        clinical_priority: 'urgent',
        snomed_id: 'not-supplied-by-source',
        performed_by: caseSnapshot.case.acceptingActor ? caseSnapshot.case.acceptingActor.name : 'Unassigned',
        requested_id: 'Dr Morgan Bell (Hospital)',
      },
      {
        task_id: 'TASK-DISCHARGE-MONITOR',
        episode_id: `EP-${patientId}-01`,
        timestamp: new Date(clock.now - 60 * 60 * 1000).toISOString(),
        title: 'Arrange post-discharge monitoring',
        status: 'OPEN',
        owner: 'High St GP Surgery',
        note: 'Review kidney function and electrolytes following hospital attendance.',
        deadline: new Date(clock.now + 24 * 60 * 60 * 1000).toISOString(),
        clinical_priority: 'urgent',
        snomed_id: 'not-supplied-by-source',
        performed_by: 'Unassigned',
        requested_id: 'Acute Care Coordinator',
      },
      {
        task_id: 'TASK-MED-REVIEW',
        episode_id: `EP-${patientId}-01`,
        timestamp: new Date(clock.now - 120 * 60 * 1000).toISOString(),
        title: '4-Week CKD Medication Review',
        status: 'PENDING_LABS',
        owner: 'High St GP Surgery (Community Pharmacy)',
        note: 'Extracted from free-text discharge summary: "Book follow-up review in 4 weeks post discharge"',
        deadline: new Date(clock.now + 28 * 24 * 60 * 60 * 1000).toISOString(),
        clinical_priority: 'standard',
        snomed_id: 'not-supplied-by-source',
        performed_by: 'Unassigned',
        requested_id: 'Ward 4 Senior Registrar',
      },
    ]

    // District statuses for town view
    const districts = {
      hospital: {
        id: 'hospital',
        name: "St. Jude's Acute Hospital",
        code: 'acute-flow',
        activeCount: caseSnapshot.case.orderingTeamId === 'hospital' ? 1 : 0,
        status: caseSnapshot.case.ownershipState === 'ORDERER_OWNS' ? 'Holding Accountable' : 'Handed Over',
        recentEvent: liveEvents.find((e) => e.actor?.includes('acute') || e.type?.includes('emergency'))?.detail ?? 'Acute admissions monitored',
      },
      diagnostics: {
        id: 'diagnostics',
        name: 'City Pathology & Diagnostics Lab',
        code: 'diagnostics',
        activeCount: 1,
        status: 'Result Released',
        recentEvent: `Automated lab assay: ${recentLab.name} ${recentLab.value} ${recentLab.unit}`,
      },
      gp: {
        id: 'gp',
        name: 'High Street GP Practice',
        code: 'primary-care',
        activeCount: caseSnapshot.case.currentAccountableOwner.teamId === 'gp' || caseSnapshot.case.currentAccountableOwner.teamId === 'gp-duty' ? 1 : 0,
        status: caseSnapshot.case.ownershipState === 'ACCEPTED' ? 'Duty GP Active' : 'Awaiting Acceptance',
        recentEvent: liveEvents.find((e) => e.type === 'accept' || e.actor?.includes('gp'))?.detail ?? 'Duty GP on duty: Dr Ada Sim',
      },
      patient: {
        id: 'patient',
        name: "Amira Khan's Residence",
        code: 'home-monitor',
        activeCount: 1,
        status: 'Connected',
        recentEvent: observations[0]?.detail ?? 'Home activity reading recorded',
      },
      pharmacy: {
        id: 'pharmacy',
        name: 'Community Care Pharmacy',
        code: 'pharmacy',
        activeCount: 0,
        status: 'Standing by',
        recentEvent: 'Repeat prescription dispatch queue active',
      },
      community: {
        id: 'community',
        name: 'Community Rehabilitation Pavilion',
        code: 'community',
        activeCount: 0,
        status: 'Step-down ready',
        recentEvent: 'Recovery garden open. No rehab outcome inferred.',
      },
      referrals: {
        id: 'referrals',
        name: 'Specialist Referrals Center',
        code: 'referrals',
        activeCount: 0,
        status: 'Suites open',
        recentEvent: 'No specialist referral opened for this result.',
      },
      wearables: {
        id: 'wearables',
        name: 'Remote Telemetry & Wearables Hub',
        code: 'wearables',
        activeCount: 1,
        status: 'Monitoring',
        recentEvent: observations[0]?.detail ?? 'Wearable stream connected',
      },
    }

    const patientProfile = PATIENT_NAMES[patientId] ?? { name: 'Amira Khan', age: 64, gender: 'Female' }

    return NextResponse.json({
      world: caseSnapshot.connection.world,
      live: container.live,
      clock: {
        now: clock.now,
        paused: clock.paused,
        speed: clock.speed,
      },
      patient: {
        id: patientId,
        ...patientProfile,
        problems,
        recentLab,
        observations,
      },
      caseSnapshot,
      tasks,
      districts,
      recentEvents: liveEvents,
      adkStatus: {
        framework: '@animahealth/adk',
        status: 'READY',
        sessionInitialized: true,
        proposalAvailable: Boolean(caseSnapshot.proposal),
        actions: caseSnapshot.proposal?.actions ?? [],
      },
    })
  } catch (error) {
    console.error('Failed to get live simulation state:', error)
    return NextResponse.json(
      { error: 'failed_to_fetch_live_state', message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
