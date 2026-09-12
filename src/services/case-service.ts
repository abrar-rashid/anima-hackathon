import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ZodError } from 'zod'
import { assembleSnapshot } from '@/agents/context-assembler'
import { compileProposal } from '@/agents/covenant-compiler'
import { analyseReliability } from '@/agents/reliability-analyst'
import type {
  AnalystInput,
  AssemblerInput,
  CompilerInput,
  Proposal,
  Snapshot,
  StaffIdentityParsed,
} from '@/agents/schemas'
import {
  CaseSnapshotResponse,
  DISABLED_DEPLOY_REASON,
  type ApproveRequestBody,
  type ApproveResult,
  type CaseSnapshot,
  type TwinRequestBody,
  type TwinResult,
} from '@/api/contracts'
import { initialCase, reduce } from '@/domain/case-reducer'
import { classify, deriveOrderingTeam, ELIGIBILITY_RULE_TEXT, selectEligible } from '@/domain/eligibility'
import { validatePatch } from '@/domain/patch-grammar'
import { parseProtocol } from '@/domain/protocol'
import { compare, replayTrace } from '@/domain/twin'
import type { CovenantCase, DomainEvent, EventEnvelope, ProtocolVersion, TeamId } from '@/domain/types'
import { bloodReportFrom } from '@/adapters/anima/mapping'
import type { AdkRuntimePort } from '@/ports/adk-runtime-port'
import type { AnimaReadPort, VersionedRecord } from '@/ports/anima-read-port'
import type { SimulatorClockPort } from '@/ports/clock-port'
import type { CaseStore, StoredCase } from '@/services/case-store'
import type { ExecutionService } from '@/services/execution-service'
import { hashProposal } from '@/services/proposal-hash'

export const DEFAULT_STAFF_ROSTER: StaffIdentityParsed[] = [
  { id: 'gp-duty-1', name: 'Dr Ada Sim', role: 'Duty GP', teamId: 'gp', attribution: 'app-side' },
  { id: 'hosp-1', name: 'Dr Morgan Bell', role: 'Hospital clinician', teamId: 'hospital', attribution: 'app-side' },
]

export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'ServiceError'
  }
}

export function errorResponse(error: unknown): { body: { error: string; detail?: string }; status: number } {
  if (error instanceof ServiceError) {
    return { body: { error: error.code }, status: error.status }
  }
  if (error instanceof ZodError) {
    return { body: { error: 'invalid-request' }, status: 400 }
  }
  const message = error instanceof Error ? error.message : 'request-failed'
  const detail = message.replace(/Bearer\s+\S+/gi, 'Bearer ***')
  return { body: { error: 'simulator-unavailable', detail }, status: 502 }
}

export interface CaseServiceDeps {
  read: AnimaReadPort
  clock: SimulatorClockPort
  runtime: AdkRuntimePort
  store: CaseStore
  execution: ExecutionService
  acceptSupported: boolean | null
  live: boolean
  world: string
  replay: StoredCase['replay']
}

export class CaseService {
  constructor(private readonly deps: CaseServiceDeps) {}

  async open(body: { patientId?: string }): Promise<CaseSnapshot> {
    const preflight = loadPreflight()
    const patientId = body.patientId ?? preflight.selectedPatientId
    if (!patientId.startsWith('SIM-')) {
      throw new ServiceError('synthetic-patients-only', 400, 'Only synthetic SIM-* patients are allowed.')
    }

    const [clock, team, diagnostics, gp, hospital] = await Promise.all([
      this.deps.clock.read(),
      this.deps.read.getTeam(),
      this.deps.read.getSiteRecords('diagnostics', patientId),
      this.deps.read.getSiteRecords('gp', patientId),
      this.deps.read.getSiteRecords('hospital', patientId),
    ])

    const reports = diagnostics.items
      .map((record) => bloodReportFrom(record))
      .filter((report): report is NonNullable<typeof report> => report !== null)

    const chosen = chooseResult(reports, patientId, preflight)
    if (!chosen) throw new ServiceError('no-eligible-result', 404, 'No eligible source-classified result is available.')

    const records = [...diagnostics.items, ...gp.items, ...hospital.items]
    const hasDischarge = records.some((record) => record.kind === 'discharge-summary')
    const ordering = deriveOrderingTeam({
      visibleTo: chosen.report.visibleTo,
      hasHospitalDischargeSummary: hasDischarge,
    })

    const protocol = loadProtocol('v3')
    const caseId = `case-${patientId}-${chosen.report.id}`
    let state = initialCase({ caseId, patientId, protocol })
    state = applyEvent(
      state,
      protocol,
      {
        type: 'ResultAvailable',
        resultId: chosen.report.id,
        resultVersion: chosen.report.version,
        orderingTeamId: ordering.orderingTeamId,
        requestedReceiver: ordering.requestedReceiver,
        classification: chosen.classification,
      },
      `${caseId}:ResultAvailable:${chosen.report.id}:${chosen.report.version}`,
      clock.now,
    )

    const activity = await this.deps.read.getActivity(caseId, [chosen.report.id])
    const assemblerInput: AssemblerInput = {
      patientId,
      result: {
        id: chosen.report.id,
        version: chosen.report.version,
        classification: chosen.classification,
        visibleTo: chosen.report.visibleTo,
        owner: chosen.report.owner,
      },
      records: records.map(toAssemblerRecord),
      activity: activity.map((entry) => ({
        id: entry.id,
        time: entry.time,
        type: entry.type,
        actor: entry.actor,
        resourceId: entry.resourceId,
      })),
      simulatorNow: clock.now,
      orderingTeamId: ordering.orderingTeamId,
      requestedReceiver: ordering.requestedReceiver,
    }

    const snapshot = await this.runAssembler(assemblerInput)
    const proposal = await this.runCompiler({
      snapshot,
      protocol: mutableProtocol(protocol),
      binding: {
        acceptSupported: this.deps.acceptSupported,
        team: team.team,
        world: team.world,
      },
    })

    const stored: StoredCase = {
      case: state,
      protocol,
      snapshot,
      proposal,
      connection: {
        live: this.deps.live,
        world: team.world || this.deps.world,
        simulatorNow: clock.now,
        acceptSupported: this.deps.acceptSupported,
      },
      eligibility: {
        ruleText: ELIGIBILITY_RULE_TEXT,
        ordererRuleText: ordering.ruleText,
        selectedResultId: chosen.report.id,
        selectedResultVersion: chosen.report.version,
      },
      replay: this.deps.replay,
      receipts: [],
      hardStops: proposal.hardStops,
    }
    this.deps.store.save(stored)
    return toSnapshot(stored)
  }

  async compile(caseId: string): Promise<CaseSnapshot> {
    const stored = this.require(caseId)
    const clock = await this.deps.clock.read()
    const team = await this.deps.read.getTeam()
    const [diagnostics, gp, hospital] = await Promise.all([
      this.deps.read.getSiteRecords('diagnostics', stored.case.patientId),
      this.deps.read.getSiteRecords('gp', stored.case.patientId),
      this.deps.read.getSiteRecords('hospital', stored.case.patientId),
    ])
    const records = [...diagnostics.items, ...gp.items, ...hospital.items]
    const activity = await this.deps.read.getActivity(caseId, [stored.case.sourceResultId])
    const assemblerInput: AssemblerInput = {
      patientId: stored.case.patientId,
      result: {
        id: stored.case.sourceResultId,
        version: stored.case.sourceResultVersion,
        classification: stored.case.sourceClassification,
        visibleTo: stored.snapshot?.visibility ?? [],
        owner: 'diagnostics',
      },
      records: records.map(toAssemblerRecord),
      activity: activity.map((entry) => ({
        id: entry.id,
        time: entry.time,
        type: entry.type,
        actor: entry.actor,
        resourceId: entry.resourceId,
      })),
      simulatorNow: clock.now,
      orderingTeamId: stored.case.orderingTeamId,
      requestedReceiver: (stored.case.requestedReceiver ?? 'gp') as TeamId,
    }
    const snapshot = await this.runAssembler(assemblerInput)
    const proposal = await this.runCompiler({
      snapshot,
      protocol: mutableProtocol(stored.protocol),
      binding: {
        acceptSupported: this.deps.acceptSupported,
        team: team.team,
        world: team.world,
      },
    })
    const next: StoredCase = {
      ...stored,
      snapshot,
      proposal,
      hardStops: proposal.hardStops,
      connection: {
        ...stored.connection,
        simulatorNow: clock.now,
        world: team.world || stored.connection.world,
        acceptSupported: this.deps.acceptSupported,
      },
    }
    this.deps.store.save(next)
    return toSnapshot(next)
  }

  async approve(caseId: string, body: ApproveRequestBody): Promise<ApproveResult> {
    const stored = this.require(caseId)
    if (!stored.proposal) throw new ServiceError('proposal-missing', 409, 'No proposal is available to approve.')
    if (hashProposal(stored.proposal) !== body.proposalHash) {
      throw new ServiceError('proposal-stale', 409)
    }
    return this.deps.execution.execute({
      caseId,
      proposal: stored.proposal,
      approval: { approved: true, approverId: body.approverId, at: Date.now() },
      actionIndexes: body.actionIndexes,
      staff: body.staff,
    })
  }

  async refresh(caseId: string): Promise<CaseSnapshot & { receipts: ApproveResult['receipts'] }> {
    const executed = await this.deps.execution.refresh(caseId)
    const stored = this.require(caseId)
    return { ...toSnapshot(stored), receipts: executed.receipts }
  }

  async twin(caseId: string, body: TwinRequestBody): Promise<TwinResult> {
    const stored = this.deps.store.get(caseId)
    const base = loadProtocol(body.baseProtocolId)
    const patched = validatePatch(base, body.diff)
    if (!patched.ok) {
      throw new ServiceError('invalid-patch', 400, patched.rejectedFields.join(','))
    }
    const trace = loadTrace(body.traceId)
    const seed = {
      caseId: stored?.case.caseId ?? 'case-after-hours-timeout',
      patientId: stored?.case.patientId ?? 'SIM-000001',
    }
    const baseline = replayTrace(trace, base, seed)
    const candidate = replayTrace(trace, patched.candidate, seed)
    const comparison = compare(baseline, candidate)
    const patch = analyseReliability({
      baseProtocol: mutableProtocol(base),
      proposedDiff: body.diff,
      traceRef: body.traceId,
      denominator: { traces: 1, events: trace.length },
    } satisfies AnalystInput)

    return {
      comparison: {
        baseline: {
          protocolId: comparison.baseline.protocolId,
          metrics: comparison.baseline.metrics,
          invariants: comparison.baseline.invariants,
          finalState: comparison.baseline.finalState,
        },
        candidate: {
          protocolId: comparison.candidate.protocolId,
          metrics: comparison.candidate.metrics,
          invariants: comparison.candidate.invariants,
          finalState: comparison.candidate.finalState,
        },
        deltas: comparison.deltas,
        candidateStatus: comparison.candidateStatus,
        sameTrace: comparison.sameTrace,
      },
      patch,
      baselineProtocol: mutableProtocol(base),
      candidateProtocol: mutableProtocol(patched.candidate),
      candidateStatus: comparison.candidateStatus === 'PASSED' ? 'PROPOSED' : 'FAILED_INVARIANTS',
      disabledDeployReason: DISABLED_DEPLOY_REASON,
      label: 'simulator regression evidence',
    }
  }

  private require(caseId: string): StoredCase {
    const stored = this.deps.store.get(caseId)
    if (!stored) throw new ServiceError('case-not-found', 404)
    return stored
  }

  private async runAssembler(input: AssemblerInput): Promise<Snapshot> {
    const result = await this.deps.runtime.run<AssemblerInput, Snapshot>('context-assembler', input)
    if (result.ok) return result.value
    if (result.fallback) return result.fallback
    return assembleSnapshot(input)
  }

  private async runCompiler(input: CompilerInput): Promise<Proposal> {
    const result = await this.deps.runtime.run<CompilerInput, Proposal>('covenant-compiler', input)
    if (result.ok) return result.value
    if (result.fallback) return result.fallback
    return compileProposal(input)
  }
}

export function staffRoster(): StaffIdentityParsed[] {
  const raw = process.env.COVENANT_STAFF_ROSTER
  if (!raw?.trim()) return DEFAULT_STAFF_ROSTER
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_STAFF_ROSTER
    const roster: StaffIdentityParsed[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as { id?: string; name?: string; role?: string; teamId?: string }
      if (!row.id || !row.name) continue
      roster.push({
        id: String(row.id),
        name: String(row.name),
        role: String(row.role ?? ''),
        teamId: (row.teamId ?? 'gp') as StaffIdentityParsed['teamId'],
        attribution: 'app-side',
      })
    }
    return roster.length > 0 ? roster : DEFAULT_STAFF_ROSTER
  } catch {
    return DEFAULT_STAFF_ROSTER
  }
}

export function toSnapshot(stored: StoredCase): CaseSnapshot {
  return CaseSnapshotResponse.parse({
    case: stored.case,
    protocol: stored.protocol,
    snapshot: stored.snapshot,
    proposal: stored.proposal,
    connection: stored.connection,
    eligibility: stored.eligibility,
    replay: stored.replay,
    staffRoster: staffRoster(),
  })
}

function chooseResult(
  reports: NonNullable<ReturnType<typeof bloodReportFrom>>[],
  patientId: string,
  preflight: Preflight,
) {
  if (patientId === preflight.selectedPatientId) {
    const pinned = reports.find((report) => report.id === preflight.selectedResultId)
    const classification = pinned ? classify(pinned) : null
    if (pinned && classification) return { report: pinned, classification }
  }
  return selectEligible(reports, { preferPatientId: patientId })
}

function toAssemblerRecord(record: VersionedRecord) {
  const data = record.data && typeof record.data === 'object' ? (record.data as { title?: unknown }) : {}
  return {
    id: record.id,
    kind: record.kind,
    version: record.version,
    title: typeof data.title === 'string' ? data.title : record.id,
    status: record.status,
    owner: record.owner,
    visibleTo: record.visibleTo,
    site: record.owner,
  }
}

function mutableProtocol(protocol: ProtocolVersion) {
  return {
    ...protocol,
    clinicalPolicyRefs: [...protocol.clinicalPolicyRefs],
  }
}

function applyEvent(
  state: CovenantCase,
  protocol: ProtocolVersion,
  event: DomainEvent,
  eventId: string,
  simulatorTime: number,
): CovenantCase {
  const envelope: EventEnvelope = {
    eventId,
    caseId: state.caseId,
    simulatorTime,
    actor: 'case-service',
    sourceVersion: state.sourceResultVersion,
    event,
  }
  return reduce(state, envelope, protocol).state
}

interface Preflight {
  selectedPatientId: string
  selectedResultId: string
  selectedResultVersion: number
  acceptSupported: boolean
  world: string
  capturedAt: string
}

export function loadPreflight(): Preflight {
  return JSON.parse(readFileSync(join(process.cwd(), 'fixtures/preflight.json'), 'utf8')) as Preflight
}

export function loadProtocol(id: string): ProtocolVersion {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, '')
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'fixtures/protocols', `${safe}.json`), 'utf8'))
  return parseProtocol(raw)
}

function loadTrace(traceId: string): EventEnvelope[] {
  const safe = traceId.replace(/[^a-zA-Z0-9._-]/g, '')
  return JSON.parse(readFileSync(join(process.cwd(), 'fixtures/traces', `${safe}.json`), 'utf8')) as EventEnvelope[]
}
