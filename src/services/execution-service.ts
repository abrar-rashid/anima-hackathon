import { taskReadbackFrom } from '@/adapters/anima/mapping'
import { IdempotencyConflict, StaleVersionError } from '@/adapters/anima/write-adapter'
import { createdHandoverTaskId } from '@/agents/covenant-compiler'
import type { Proposal } from '@/agents/schemas'
import type { ReceiptRow } from '@/api/contracts'
import { reduce } from '@/domain/case-reducer'
import { idempotencyKey } from '@/domain/idempotency'
import { isOutstandingTransfer } from '@/domain/ownership-reducer'
import type {
  CovenantCase,
  DomainEvent,
  EventEnvelope,
  EvidenceRef,
  ProtocolVersion,
  SiteId,
  StaffIdentity,
} from '@/domain/types'
import type { AnimaReadPort, VersionedRecord } from '@/ports/anima-read-port'
import type { AnimaWritePort, SubmissionReceipt } from '@/ports/anima-write-port'
import type { CaseStore } from '@/services/case-store'

export const ACTIVITY_HARD_STOP = 'Activity evidence unavailable: closure/audit claim blocked'
export const WRITES_DISABLED = 'writes-disabled: staff identity absent'

export interface ExecuteInput {
  caseId: string
  proposal: Proposal
  approval: { approved: boolean; approverId: string; at: number }
  actionIndexes: number[]
  staff?: StaffIdentity | null
}

export interface ExecuteResult {
  receipts: ReceiptRow[]
  case: CovenantCase
  hardStops: string[]
}

interface TrackedReceipt extends ReceiptRow {
  site: SiteId
  title?: string
}

export class ExecutionService {
  constructor(
    private readonly deps: {
      read: AnimaReadPort
      write: AnimaWritePort
      store: CaseStore
      acceptSupported: boolean | null
    },
  ) {}

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    const stored = this.require(input.caseId)
    let state = stored.case
    const protocol = stored.protocol
    const now = (await this.deps.read.getClock()).now
    const hardStops = [...(input.proposal.hardStops ?? stored.hardStops)]

    if (input.approval.approved !== true || !hasStaff(input.staff)) {
      const receipts: ReceiptRow[] = [
        blankReceipt(input.actionIndexes[0] ?? 0, 'FAILED', WRITES_DISABLED),
      ]
      return { receipts, case: state, hardStops }
    }

    const staff = input.staff
    const selected = input.actionIndexes
      .map((actionIndex) => ({ actionIndex, action: input.proposal.actions[actionIndex] }))
      .filter((row): row is { actionIndex: number; action: Proposal['actions'][number] } => Boolean(row.action))
    const kinds = new Set(selected.map((row) => row.action.kind))
    if (kinds.has('create_task') && kinds.has('accept')) {
      return {
        receipts: selected.map((row) => blankReceipt(row.actionIndex, 'FAILED', 'separate-approval-required')),
        case: state,
        hardStops,
      }
    }
    const currentVersion = await this.readSourceVersion(state)
    const expected = expectedSourceVersion(input.proposal, state)
    if (currentVersion == null || expected == null || currentVersion !== expected) {
      if (currentVersion != null && currentVersion !== state.sourceResultVersion) {
        state = this.apply(
          state,
          protocol,
          { type: 'SourceVersionChanged', newVersion: currentVersion },
          `${state.caseId}:SourceVersionChanged:${currentVersion}`,
          now,
        )
      }
      const receipts = input.actionIndexes.map((actionIndex) => blankReceipt(actionIndex, 'STALE', 'proposal-stale'))
      this.persist(stored, state, receipts, hardStops, now)
      return { receipts, case: state, hardStops }
    }

    const team = await this.deps.read.getTeam()
    const receipts: TrackedReceipt[] = []

    for (const actionIndex of input.actionIndexes) {
      const action = input.proposal.actions[actionIndex]
      if (!action) continue
      if (action.supported === false) continue
      if (action.kind === 'accept') {
        if (!state.requestedReceiver || staff.teamId !== state.requestedReceiver) {
          receipts.push({
            ...blankReceipt(actionIndex, 'FAILED', 'receiver-approval-required'),
            site: action.site,
            title: payloadTitle(action.payload),
          })
          continue
        }
      }
      const resolvedPayload = resolveActionPayload(
        action,
        input.proposal,
        [...stored.receipts, ...receipts],
        state.sourceResultId,
      )
      if (action.kind === 'accept' && !payloadResourceId(resolvedPayload)) {
        receipts.push({
          ...blankReceipt(actionIndex, 'FAILED', 'accept-task-id-unknown'),
          site: action.site,
          title: payloadTitle(action.payload),
        })
        continue
      }

      const key = idempotencyKey({
        team: team.team,
        patientId: state.patientId,
        resultId: state.sourceResultId,
        resultVersion: currentVersion,
        protocolVersion: protocol.id,
        actionKind: action.kind,
        destination: action.site,
      })
      const writeInput = {
        site: action.site,
        actionName: action.kind,
        payload: resolvedPayload,
        staffIdentity: staff,
        expectedSourceVersions: [{ id: state.sourceResultId, version: currentVersion }],
        idempotencyKey: key,
      }

      try {
        const receipt = await this.writeWithRecovery(writeInput, action.site, state.patientId, payloadTitle(action.payload))
        const evidence = submittedEvidence(action.site, receipt)
        state = this.apply(
          state,
          protocol,
          { type: 'ActionSubmitted', actionKind: action.kind, idempotencyKey: key, receipt: evidence },
          `${state.caseId}:ActionSubmitted:${key}`,
          receipt.simulatorTime || now,
        )
        if (!isOutstandingTransfer(state)) {
          state = this.apply(
            state,
            protocol,
            {
              type: 'TransferRequested',
              toTeam: input.proposal.transfer.toTeam,
              toActorId: input.proposal.transfer.toActorId,
              ackDeadlineAt: input.proposal.deadlines.ackDeadlineAt,
            },
            `${state.caseId}:TransferRequested:${key}`,
            receipt.simulatorTime || now,
          )
        }
        receipts.push({
          actionIndex,
          status: 'SUBMITTED',
          resourceId: receipt.resourceId || null,
          version: receipt.version ?? null,
          activityId: evidence.activityId ?? null,
          error: null,
          site: action.site,
          title: payloadTitle(action.payload),
        })
      } catch (error) {
        if (isIdempotencyConflict(error)) {
          receipts.push({
            actionIndex,
            status: 'DUPLICATE_LINKED',
            resourceId: error.originalResourceId ?? null,
            version: null,
            activityId: null,
            error: 'IdempotencyConflict',
            site: action.site,
            title: payloadTitle(action.payload),
          })
          continue
        }
        if (isStaleVersion(error)) {
          receipts.push({
            ...blankReceipt(actionIndex, 'STALE', 'StaleVersionError'),
            site: action.site,
            title: payloadTitle(action.payload),
          })
          continue
        }
        receipts.push({
          ...blankReceipt(actionIndex, 'FAILED', errorMessage(error)),
          site: action.site,
          title: payloadTitle(action.payload),
        })
      }
    }

    const evidenced = await this.collectEvidence(state, protocol, staff, receipts, now, hardStops)
    this.persist(stored, evidenced.case, evidenced.receipts, evidenced.hardStops, now)
    return evidenced
  }

  async refresh(caseId: string): Promise<ExecuteResult> {
    const stored = this.require(caseId)
    let state = stored.case
    const now = (await this.deps.read.getClock()).now
    const currentVersion = await this.readSourceVersion(state)
    if (currentVersion != null && currentVersion !== state.sourceResultVersion) {
      state = this.apply(
        state,
        stored.protocol,
        { type: 'SourceVersionChanged', newVersion: currentVersion },
        `${state.caseId}:SourceVersionChanged:${currentVersion}`,
        now,
      )
    }
    const receipts: TrackedReceipt[] = stored.receipts.map((row) => ({
      ...row,
      site: siteFromCase(state, row.resourceId),
    }))
    const staff = state.acceptingActor
    const evidenced = await this.collectEvidence(
      state,
      stored.protocol,
      staff,
      receipts,
      now,
      [...stored.hardStops],
    )
    this.persist(stored, evidenced.case, evidenced.receipts, evidenced.hardStops, now)
    return evidenced
  }

  private persist(
    stored: ReturnType<CaseStore['get']> & object,
    state: CovenantCase,
    receipts: ReceiptRow[],
    hardStops: string[],
    now: number,
  ): void {
    this.deps.store.save({
      ...stored,
      case: state,
      receipts: mergeReceipts(stored.receipts, receipts),
      hardStops,
      connection: { ...stored.connection, simulatorNow: now },
    })
  }

  private require(caseId: string) {
    const stored = this.deps.store.get(caseId)
    if (!stored) {
      throw Object.assign(new Error('case-not-found'), { code: 'case-not-found', status: 404 })
    }
    return stored
  }

  private apply(
    state: CovenantCase,
    protocol: ProtocolVersion,
    event: DomainEvent,
    eventId: string,
    simulatorTime: number,
    extras?: { actor?: string; activityId?: string },
  ): CovenantCase {
    const envelope: EventEnvelope = {
      eventId,
      caseId: state.caseId,
      simulatorTime,
      actor: extras?.actor ?? 'execution',
      sourceVersion: state.sourceResultVersion,
      activityId: extras?.activityId,
      event,
    }
    return reduce(state, envelope, protocol).state
  }

  private async readSourceVersion(state: CovenantCase): Promise<number | null> {
    const page = await this.deps.read.getSiteRecords('diagnostics', state.patientId)
    const match = page.items.find((item) => item.id === state.sourceResultId)
    return match ? match.version : null
  }

  private async writeWithRecovery(
    input: Parameters<AnimaWritePort['executeApprovedAction']>[0],
    site: SiteId,
    patientId: string,
    title: string | undefined,
  ): Promise<SubmissionReceipt> {
    try {
      return await this.deps.write.executeApprovedAction(input)
    } catch (error) {
      if (isIdempotencyConflict(error) || isStaleVersion(error)) throw error
      if (!isUncertainWrite(error)) throw error
      const found = await this.findResource(site, patientId, { title })
      if (found) {
        return {
          resourceId: found.id,
          version: found.version,
          simulatorTime: found.createdAt,
          activity: null,
          httpStatus: 200,
        }
      }
      return this.deps.write.executeApprovedAction(input)
    }
  }

  private async findResource(
    site: SiteId,
    patientId: string,
    hints: { resourceId?: string | null; title?: string },
  ): Promise<VersionedRecord | null> {
    const page = await this.deps.read.getSiteRecords(site, patientId)
    if (hints.resourceId) {
      const byId = page.items.find((item) => item.id === hints.resourceId)
      if (byId) return byId
    }
    if (hints.title) {
      const byTitle = page.items.find((item) => recordTitle(item) === hints.title)
      if (byTitle) return byTitle
    }
    return null
  }

  private async collectEvidence(
    state: CovenantCase,
    protocol: ProtocolVersion,
    staff: StaffIdentity | null | undefined,
    receipts: TrackedReceipt[],
    now: number,
    hardStops: string[],
  ): Promise<ExecuteResult> {
    let next = state
    const updated = receipts.map((row) => ({ ...row }))
    let sawVisible = false
    let sawActivity = false

    for (const row of updated) {
      if (row.status === 'FAILED' || row.status === 'STALE' || row.status === 'DUPLICATE_LINKED') continue
      const found = await this.findResource(row.site, next.patientId, {
        resourceId: row.resourceId,
        title: row.title,
      })
      if (!found) continue

      const bundle = await this.deps.read.getGpConnectBundle(next.patientId).catch(() => null)
      const readback = bundle ? taskReadbackFrom(bundle, found.id) : null
      if (!readback) continue
      const visible = found
      const evidence: EvidenceRef = {
        site: row.site,
        resourceId: visible.id,
        resourceVersion: visible.version,
        observedAtSimulatorTime: now,
        eventType: 'ActionVisibleDownstream',
      }
      next = this.apply(
        next,
        protocol,
        { type: 'ActionVisibleDownstream', evidence },
        `${next.caseId}:ActionVisibleDownstream:${visible.id}:${visible.version}`,
        now,
      )
      row.status = 'VISIBLE_DOWNSTREAM'
      row.resourceId = visible.id
      row.version = visible.version
      sawVisible = true

      const status = readback?.status ?? visible.status
      if (
        this.deps.acceptSupported === true &&
        status === 'accepted' &&
        hasChangeActor(visible) &&
        staff
      ) {
        const after = this.apply(
          next,
          protocol,
          { type: 'TransferAccepted', actor: staff },
          `${next.caseId}:TransferAccepted:${visible.id}`,
          now,
          { actor: staff.id },
        )
        if (after.eventLog.length !== next.eventLog.length || after.ownershipState === 'ACCEPTED') {
          next = after
          if (next.ownershipState === 'ACCEPTED') row.status = 'ACCEPTED'
        }
      }

      const created = createdProvenance(visible)
      const activities = await this.deps.read.getActivity(next.caseId, [visible.id])
      const activity = activities.find((entry) => entry.resourceId === visible.id)
      if (created || activity) {
        const activityId = activity?.id ?? created?.activityId
        const activityEvidence: EvidenceRef = {
          site: row.site,
          resourceId: visible.id,
          resourceVersion: visible.version,
          observedAtSimulatorTime: created?.time ?? activity?.time ?? now,
          activityId,
          eventType: 'ActivityEvidenced',
        }
        const before = next
        next = this.apply(
          next,
          protocol,
          { type: 'ActivityEvidenced', evidence: activityEvidence },
          `${next.caseId}:ActivityEvidenced:${visible.id}`,
          activityEvidence.observedAtSimulatorTime,
          { activityId },
        )
        if (next.submissionState === 'EVIDENCED' || next.eventLog.length > before.eventLog.length) {
          if (next.submissionState === 'EVIDENCED') {
            row.status = 'EVIDENCED'
            row.activityId = activityId ?? null
            sawActivity = true
          }
        }
      }
    }

    if (sawVisible && !sawActivity && next.submissionState !== 'EVIDENCED') {
      if (!hardStops.includes(ACTIVITY_HARD_STOP)) hardStops.push(ACTIVITY_HARD_STOP)
    }

    return { receipts: updated.map(stripTrack), case: next, hardStops }
  }
}

function hasStaff(staff?: StaffIdentity | null): staff is StaffIdentity {
  return Boolean(staff && staff.id && staff.teamId && staff.attribution === 'app-side')
}

function expectedSourceVersion(proposal: Proposal, state: CovenantCase): number | null {
  for (const action of proposal.actions) {
    const match = action.sourceVersions.find((item) => item.id === state.sourceResultId)
    if (match) return match.version
  }
  return proposal.actions[0]?.sourceVersions[0]?.version ?? state.sourceResultVersion
}

function blankReceipt(actionIndex: number, status: ReceiptRow['status'], error: string): ReceiptRow {
  return { actionIndex, status, resourceId: null, version: null, activityId: null, error }
}

function submittedEvidence(site: SiteId, receipt: SubmissionReceipt): EvidenceRef {
  return {
    site,
    resourceId: receipt.resourceId,
    resourceVersion: receipt.version,
    observedAtSimulatorTime: receipt.simulatorTime,
    eventType: 'ActionSubmitted',
    activityId: receipt.activity ? `${receipt.activity.action}@${receipt.version}` : undefined,
  }
}

function payloadTitle(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const title = (payload as { title?: unknown }).title
  return typeof title === 'string' ? title : undefined
}

function recordTitle(record: VersionedRecord): string {
  if (!record.data || typeof record.data !== 'object') return ''
  const title = (record.data as { title?: unknown }).title
  return typeof title === 'string' ? title : ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function hasChangeActor(record: VersionedRecord): boolean {
  const changes = asRecord(record.provenance).changes
  if (!Array.isArray(changes)) return false
  return changes.some((change) => {
    const actor = asRecord(asRecord(change).actor)
    return nonEmptyString(actor.kind) || nonEmptyString(actor.name)
  })
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function payloadResourceId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const id = (payload as { resourceId?: unknown }).resourceId
  return typeof id === 'string' && id.trim().length > 0 ? id : undefined
}

function resolveActionPayload(
  action: Proposal['actions'][number],
  proposal: Proposal,
  receipts: { actionIndex: number; resourceId: string | null }[],
  sourceResultId: string,
): unknown {
  if (action.kind !== 'accept') return action.payload
  const fromReceipts = createdHandoverTaskId(proposal, receipts, sourceResultId)
  const fromPayload = payloadResourceId(action.payload)
  const taskId =
    fromReceipts ?? (fromPayload && fromPayload !== sourceResultId ? fromPayload : undefined)
  if (!taskId) return { type: 'accept' }
  return { type: 'accept', resourceId: taskId }
}

function mergeReceipts(previous: ReceiptRow[], next: ReceiptRow[]): ReceiptRow[] {
  const byIndex = new Map(previous.map((row) => [row.actionIndex, row]))
  for (const row of next) byIndex.set(row.actionIndex, row)
  return [...byIndex.values()].sort((a, b) => a.actionIndex - b.actionIndex)
}

function createdProvenance(record: VersionedRecord): { time: number; version: number; activityId: string } | null {
  const created = asRecord(asRecord(record.provenance).created)
  const actor = asRecord(created.actor)
  const time = typeof created.time === 'number' ? created.time : null
  const version = typeof created.version === 'number' ? created.version : record.version
  if (!actor.kind && !actor.name) return null
  if (time == null) return null
  const action = typeof created.action === 'string' ? created.action : 'activity'
  return { time, version, activityId: `${action}@${version}` }
}

function isIdempotencyConflict(error: unknown): error is IdempotencyConflict {
  return error instanceof IdempotencyConflict || (error instanceof Error && error.name === 'IdempotencyConflict')
}

function isStaleVersion(error: unknown): error is StaleVersionError {
  return error instanceof StaleVersionError || (error instanceof Error && error.name === 'StaleVersionError')
}

function isUncertainWrite(error: unknown): boolean {
  if (isIdempotencyConflict(error) || isStaleVersion(error)) return false
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: number }).status
    if (typeof status === 'number' && status >= 400) return false
  }
  return true
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function stripTrack(row: TrackedReceipt): ReceiptRow {
  return {
    actionIndex: row.actionIndex,
    status: row.status,
    resourceId: row.resourceId,
    version: row.version,
    activityId: row.activityId,
    error: row.error,
  }
}

function siteFromCase(state: CovenantCase, resourceId: string | null): SiteId {
  const ref = state.evidenceRefs.find((item) => item.resourceId === resourceId)
  if (ref && ref.site !== 'clock') return ref.site
  const receiver = state.requestedReceiver
  if (receiver && receiver !== 'gp-duty') return receiver
  return 'gp'
}
