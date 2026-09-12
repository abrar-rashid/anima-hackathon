import { join } from 'node:path'
import { AdkRuntime } from '@/agents/runtime'
import { AnimaClockAdapter } from '@/adapters/anima/clock-adapter'
import { createAnimaClient } from '@/adapters/anima/client'
import { AnimaReadAdapter } from '@/adapters/anima/read-adapter'
import { AnimaWriteAdapter } from '@/adapters/anima/write-adapter'
import { FakeRead } from '@/adapters/fake/anima-read'
import { FakeWrite } from '@/adapters/fake/anima-write'
import { FakeClock } from '@/adapters/fake/clock'
import type { AdkRuntimePort } from '@/ports/adk-runtime-port'
import type { AnimaReadPort } from '@/ports/anima-read-port'
import type { AnimaWritePort, ExecuteApprovedActionInput } from '@/ports/anima-write-port'
import type { SimulatorClockPort } from '@/ports/clock-port'
import { CaseService, loadPreflight } from '@/services/case-service'
import { CaseStore, type StoredCase } from '@/services/case-store'
import { ExecutionService } from '@/services/execution-service'

export type RuntimeMode = 'live' | 'fake' | 'replay'

export interface AppContainer {
  mode: RuntimeMode
  live: boolean
  read: AnimaReadPort
  write: AnimaWritePort & { calls: ExecuteApprovedActionInput[] }
  clock: SimulatorClockPort
  runtime: AdkRuntimePort
  store: CaseStore
  execution: ExecutionService
  cases: CaseService
  acceptSupported: boolean | null
  replay: StoredCase['replay']
}

let singleton: AppContainer | null = null

export function resetContainer(): void {
  singleton = null
}

export function getContainer(): AppContainer {
  if (!singleton) singleton = createContainer()
  return singleton
}

function createContainer(): AppContainer {
  const preflight = loadPreflight()
  const acceptSupported = preflight.acceptSupported === true
  if (process.env.COVENANT_FAKE_PORTS === '1') {
    return buildFake('fake', acceptSupported, null, preflight.world)
  }
  if (process.env.COVENANT_RECORDED_REPLAY === '1') {
    return buildFake(
      'replay',
      acceptSupported,
      {
        label: 'Recorded simulator replay',
        world: preflight.world,
        capturedAt: preflight.capturedAt,
      },
      preflight.world,
    )
  }
  return buildLive(acceptSupported, preflight.world)
}

function buildFake(
  mode: 'fake' | 'replay',
  acceptSupported: boolean,
  replay: StoredCase['replay'],
  world: string,
): AppContainer {
  const clock = new FakeClock()
  const read = new FakeRead({ clock })
  seedHero(read)
  const write = new FakeWrite(read, clock)
  return assemble(mode, false, read, write, clock, acceptSupported, replay, world)
}

function buildLive(acceptSupported: boolean, world: string): AppContainer {
  const client = createAnimaClient()
  const read = new AnimaReadAdapter(client)
  const write = Object.assign(new AnimaWriteAdapter(client), { calls: [] as ExecuteApprovedActionInput[] })
  const clock = new AnimaClockAdapter(client)
  return assemble('live', true, read, write, clock, acceptSupported, null, world)
}

function assemble(
  mode: RuntimeMode,
  live: boolean,
  read: AnimaReadPort,
  write: AnimaWritePort & { calls: ExecuteApprovedActionInput[] },
  clock: SimulatorClockPort,
  acceptSupported: boolean | null,
  replay: StoredCase['replay'],
  world: string,
): AppContainer {
  const store = new CaseStore(join(process.cwd(), '.data', 'cases'))
  const runtime = new AdkRuntime()
  const execution = new ExecutionService({ read, write, store, acceptSupported })
  const cases = new CaseService({
    read,
    clock,
    runtime,
    store,
    execution,
    acceptSupported,
    live,
    world,
    replay,
  })
  return { mode, live, read, write, clock, runtime, store, execution, cases, acceptSupported, replay }
}

function seedHero(read: FakeRead): void {
  const patientId = 'SIM-000001'
  read.addRecord(patientId, {
    id: 'blood-v1-SIM-000001-crp-5',
    kind: 'report',
    version: 1,
    patientId,
    owner: 'diagnostics',
    visibleTo: ['gp', 'hospital', 'diagnostics'],
    status: 'available',
    createdAt: 1_789_117_200_000,
    data: {
      kind: 'blood-result',
      collectedAt: 1_789_113_600_000,
      analytes: [
        {
          id: 'crp',
          name: 'C-reactive protein',
          unit: 'mg/L',
          value: 5.6,
          referenceLow: 0,
          referenceHigh: 5,
        },
      ],
    },
  })
  read.addRecord(patientId, {
    id: 'discharge-summary-example',
    kind: 'discharge-summary',
    version: 1,
    patientId,
    owner: 'hospital',
    visibleTo: ['hospital', 'gp'],
    status: 'sent',
    createdAt: 1_789_286_400_000,
    data: { title: 'Discharge summary · monitoring handover' },
  })
  read.addRecord(patientId, {
    id: 'r-2',
    kind: 'task',
    version: 1,
    patientId,
    owner: 'gp',
    visibleTo: ['gp'],
    status: 'open',
    createdAt: 1_789_200_000_000,
    data: { title: 'Arrange post-discharge monitoring' },
  })
}
