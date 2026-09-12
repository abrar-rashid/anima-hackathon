/**
 * Live smoke against the Anima simulator: one human-approved create_task,
 * destination readback, Activity/provenance match, labelled replay capture,
 * then an explicit idempotency re-run.
 *
 * Writes: fixtures/replay/<world>-<timestamp>.json
 *
 * HTTP 200 is SUBMITTED only. VISIBLE_DOWNSTREAM needs a matching readback.
 * EVIDENCED needs a matching Activity record. Anything else is not claimed.
 */
import { createInterface } from 'node:readline/promises'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { AdkRuntime } from '@/agents/runtime'
import type { Proposal } from '@/agents/schemas'
import { AnimaClockAdapter } from '@/adapters/anima/clock-adapter'
import { createAnimaClient } from '@/adapters/anima/client'
import { AnimaReadAdapter } from '@/adapters/anima/read-adapter'
import { AnimaWriteAdapter } from '@/adapters/anima/write-adapter'
import type { ReceiptRow } from '@/api/contracts'
import { idempotencyKey } from '@/domain/idempotency'
import type { SiteId } from '@/domain/types'
import type { AnimaReadPort, VersionedRecord } from '@/ports/anima-read-port'
import type { AnimaWritePort, ExecuteApprovedActionInput } from '@/ports/anima-write-port'
import { CaseService, DEFAULT_STAFF_ROSTER } from '@/services/case-service'
import { CaseStore } from '@/services/case-store'
import { ACTIVITY_HARD_STOP, ExecutionService } from '@/services/execution-service'

const ROOT = path.resolve(import.meta.dirname, '..')
const FIXTURES = path.join(ROOT, 'fixtures')
const REPLAY_DIR = path.join(FIXTURES, 'replay')
const PREFLIGHT_PATH = path.join(FIXTURES, 'preflight.json')

const REDACT_KEYS = new Set(['text', 'body', 'clinicalDetails', 'detail', 'notes', 'summary'])

process.chdir(ROOT)

const KEY = process.env.ANIMA_SIM_API_KEY

if (process.env.COVENANT_FAKE_PORTS === '1' || process.env.COVENANT_RECORDED_REPLAY === '1') {
  console.error(
    'smoke-live requires real adapters. Unset COVENANT_FAKE_PORTS and COVENANT_RECORDED_REPLAY.',
  )
  process.exit(1)
}

if (!KEY) {
  console.error('ANIMA_SIM_API_KEY is empty. Populate .env.local before running smoke:live.')
  process.exit(1)
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/Bearer\s+\S+/.test(value)) return '[redacted]'
    if (KEY && value.includes(KEY)) return '[redacted]'
    return value
  }
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k) && typeof v === 'string' ? '[redacted]' : redact(v)
    }
    return out
  }
  return value
}

function redactMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const redacted = redact(message)
  return typeof redacted === 'string' ? redacted : 'request-failed'
}

interface PreflightFile {
  world: string
  team?: { team?: string; world?: string }
  capturedAt?: string
  selectedPatientId: string
  selectedResultId: string
  selectedResultVersion: number
  acceptSupported: boolean | null
}

class CountingWrite implements AnimaWritePort {
  readonly calls: ExecuteApprovedActionInput[] = []

  constructor(private readonly inner: AnimaWritePort) {}

  async executeApprovedAction(input: ExecuteApprovedActionInput) {
    this.calls.push(input)
    return this.inner.executeApprovedAction(input)
  }
}

function recordTitle(record: VersionedRecord): string {
  if (!record.data || typeof record.data !== 'object') return ''
  const title = (record.data as { title?: unknown }).title
  return typeof title === 'string' ? title : ''
}

async function listMatchingTasks(
  read: AnimaReadPort,
  site: SiteId,
  patientId: string,
  title: string,
): Promise<VersionedRecord[]> {
  const page = await read.getSiteRecords(site, patientId)
  return page.items.filter((item) => item.kind === 'task' && recordTitle(item) === title)
}

function payloadTitle(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const title = (payload as { title?: unknown }).title
  return typeof title === 'string' ? title : ''
}

function printReceiptChain(receipts: ReceiptRow[], hardStops: string[]): void {
  console.log('Receipt chain:')
  console.log('  HTTP 200 on a write is SUBMITTED only.')
  console.log('  VISIBLE_DOWNSTREAM requires a matching destination readback.')
  console.log('  EVIDENCED requires a matching Activity/provenance record.')
  if (receipts.length === 0) {
    console.log('  no receipts')
  }
  for (const row of receipts) {
    console.log(
      `  action ${row.actionIndex}: ${row.status}` +
        `${row.resourceId ? ` resource=${row.resourceId}` : ''}` +
        `${row.version != null ? ` v${row.version}` : ''}` +
        `${row.activityId ? ` activity=${row.activityId}` : ''}` +
        `${row.error ? ` error=${row.error}` : ''}`,
    )
    if (row.status === 'SUBMITTED') {
      console.log('    Destination visibility and Activity evidence are not confirmed.')
    }
    if (row.status === 'VISIBLE_DOWNSTREAM' || row.status === 'ACCEPTED') {
      if (!row.activityId) {
        console.log(`    HARD STOP: ${ACTIVITY_HARD_STOP}`)
        console.log('    EVIDENCED is not claimed.')
      }
    }
    if (row.status === 'EVIDENCED') {
      console.log('    Matching Activity/provenance record was returned.')
    }
    if (row.status === 'DUPLICATE_LINKED') {
      console.log('    Linked the original resource. No new task is claimed.')
    }
  }
  if (hardStops.includes(ACTIVITY_HARD_STOP)) {
    console.log(`HARD STOP: ${ACTIVITY_HARD_STOP}`)
    console.log('EVIDENCED is not claimed.')
  } else if (hardStops.length > 0) {
    console.log('Hard stops:')
    for (const stop of hardStops) console.log(`  ${stop}`)
  }
}

async function promptApprove(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question('Type APPROVE to send this single write, anything else to abort: ')).trim()
  rl.close()
  return answer
}

async function main() {
  const preflight = JSON.parse(await readFile(PREFLIGHT_PATH, 'utf8')) as PreflightFile
  const patientId = preflight.selectedPatientId
  if (!patientId?.startsWith('SIM-')) {
    throw new Error('preflight selectedPatientId must be a synthetic SIM-* patient')
  }

  const client = createAnimaClient()
  const read = new AnimaReadAdapter(client)
  const write = new CountingWrite(new AnimaWriteAdapter(client))
  const clock = new AnimaClockAdapter(client)
  const store = new CaseStore()
  const runtime = new AdkRuntime()
  const acceptSupported = preflight.acceptSupported === true
  const execution = new ExecutionService({ read, write, store, acceptSupported })
  const cases = new CaseService({
    read,
    clock,
    runtime,
    store,
    execution,
    acceptSupported,
    live: true,
    world: preflight.world,
    replay: null,
  })

  console.log(`opening case for ${patientId} through live adapters (reads only)`)
  const snapshot = await cases.open({ patientId })
  const proposal = snapshot.proposal
  if (!proposal) throw new Error('compiler returned no proposal; no write was sent')

  const createIndex = proposal.actions.findIndex((action) => action.kind === 'create_task' && action.supported)
  if (createIndex < 0) throw new Error('no supported create_task action; no write was sent')
  const createTask = proposal.actions[createIndex]
  if (!createTask) throw new Error('no supported create_task action; no write was sent')

  const team = await read.getTeam()
  const key = idempotencyKey({
    team: team.team,
    patientId: snapshot.case.patientId,
    resultId: snapshot.case.sourceResultId,
    resultVersion: snapshot.case.sourceResultVersion,
    protocolVersion: snapshot.protocol.id,
    actionKind: createTask.kind,
    destination: createTask.site,
  })
  const title = payloadTitle(createTask.payload)
  const staff = DEFAULT_STAFF_ROSTER[0]
  if (!staff) throw new Error('staff roster is empty; no write was sent')

  console.log(`CREATE_TASK PAYLOAD (POST /api/sites/${createTask.site}/actions):`)
  console.log(JSON.stringify(createTask.payload, null, 2))
  console.log('intended destination:', createTask.site)
  console.log('expected readback:', createTask.expectedReadback)
  console.log('source versions:', JSON.stringify(createTask.sourceVersions))
  console.log('idempotency key:', key)
  console.log(
    `app-side staff: ${staff.id} (${staff.name}, ${staff.role}, team ${staff.teamId}, ${staff.attribution})`,
  )
  console.log(`write-port calls so far: ${write.calls.length}`)

  const answer = await promptApprove()
  if (answer !== 'APPROVE') {
    console.error('Aborted. No write was sent.')
    if (write.calls.length !== 0) {
      throw new Error('write port was called before approval; aborting')
    }
    process.exit(1)
  }

  const tasksBefore = await listMatchingTasks(read, createTask.site, patientId, title)
  console.log(
    `matching destination tasks before write: ${tasksBefore.length}` +
      `${tasksBefore.length ? ` [${tasksBefore.map((item) => item.id).join(', ')}]` : ''}`,
  )

  const approval = { approved: true as const, approverId: staff.id, at: Date.now() }
  const executeInput = {
    caseId: snapshot.case.caseId,
    proposal: proposal as Proposal,
    approval,
    actionIndexes: [createIndex],
    staff,
  }

  let first = await execution.execute(executeInput)
  if (first.receipts.some((row) => row.status === 'SUBMITTED')) {
    console.log('First receipt is SUBMITTED only; refreshing readback and Activity once (reads only).')
    first = await execution.refresh(snapshot.case.caseId)
  }

  console.log('First execute (one intended write):')
  printReceiptChain(first.receipts, first.hardStops)
  console.log(`current accountable owner: ${first.case.currentAccountableOwner.teamId}`)
  console.log(`ownership: ${first.case.ownershipState}; submission: ${first.case.submissionState}`)
  console.log(`write-port calls after first execute: ${write.calls.length}`)

  const tasksAfterFirst = await listMatchingTasks(read, createTask.site, patientId, title)
  console.log(
    `matching destination tasks after first execute: ${tasksAfterFirst.length}` +
      `${tasksAfterFirst.length ? ` [${tasksAfterFirst.map((item) => item.id).join(', ')}]` : ''}`,
  )

  const capturedAt = new Date().toISOString()
  const world = team.world || preflight.world
  const stamp = capturedAt.replace(/[:.]/g, '-')
  const worldSafe = world.replace(/[^a-zA-Z0-9._-]/g, '_')
  await mkdir(REPLAY_DIR, { recursive: true })
  const replayPath = path.join(REPLAY_DIR, `${worldSafe}-${stamp}.json`)
  const capture = {
    label: 'Recorded simulator replay' as const,
    world,
    capturedAt,
    case: redact(first.case),
    receipts: redact(first.receipts),
  }
  await writeFile(replayPath, JSON.stringify(capture, null, 2))
  console.log(`wrote ${path.relative(ROOT, replayPath)}`)

  console.log('Re-running the same approved create_task (idempotency check).')
  const second = await execution.execute(executeInput)
  console.log('Second execute:')
  printReceiptChain(second.receipts, second.hardStops)
  console.log(`write-port calls after second execute: ${write.calls.length}`)

  const tasksAfterSecond = await listMatchingTasks(read, createTask.site, patientId, title)
  console.log(
    `matching destination tasks after second execute: ${tasksAfterSecond.length}` +
      `${tasksAfterSecond.length ? ` [${tasksAfterSecond.map((item) => item.id).join(', ')}]` : ''}`,
  )

  const firstReceipt = first.receipts[0]
  const secondReceipt = second.receipts[0]
  const linkedOriginal =
    secondReceipt?.resourceId &&
    (secondReceipt.resourceId === firstReceipt?.resourceId ||
      tasksAfterFirst.some((item) => item.id === secondReceipt.resourceId))
  const noNewTask = tasksAfterSecond.length === tasksAfterFirst.length
  const duplicateLinked = secondReceipt?.status === 'DUPLICATE_LINKED'
  const sameKey = write.calls.length >= 2 && write.calls[0]?.idempotencyKey === write.calls[1]?.idempotencyKey

  console.log('IDEMPOTENCY CHECK (explicit):')
  console.log(`  first receipt: ${firstReceipt?.status ?? 'none'} resource=${firstReceipt?.resourceId ?? 'none'}`)
  console.log(`  second receipt: ${secondReceipt?.status ?? 'none'} resource=${secondReceipt?.resourceId ?? 'none'}`)
  console.log(`  second run reported DUPLICATE_LINKED: ${duplicateLinked ? 'yes' : 'NO'}`)
  console.log(`  second run linked the original resource: ${linkedOriginal ? 'yes' : 'NO'}`)
  console.log(`  new matching tasks on second run: ${noNewTask ? '0' : tasksAfterSecond.length - tasksAfterFirst.length}`)
  console.log(`  same idempotency key on both write-port calls: ${sameKey ? 'yes' : write.calls.length < 2 ? 'n/a' : 'NO'}`)

  if (duplicateLinked && noNewTask && (linkedOriginal || !secondReceipt.resourceId)) {
    console.log('RESULT: second run linked the original and reported DUPLICATE_LINKED. No second task was created.')
    return
  }

  throw new Error(
    'Idempotency check failed: expected DUPLICATE_LINKED and no second task. See the printed receipts.',
  )
}

main().catch((err) => {
  console.error('smoke-live failed:', redactMessage(err))
  process.exit(1)
})
