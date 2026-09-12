/**
 * Read-only incremental sync: one pass against the live simulator.
 *
 * Invocation (package.json is owned by another worker — do not add a script):
 *   npx tsx --env-file=.env.local scripts/sync-once.ts
 *
 * Optional:
 *   SYNC_PATIENT_ID=SIM-000001
 *   SYNC_ALL_PATIENTS=1
 *
 * Never writes to the simulator. Never prints ANIMA_SIM_API_KEY.
 */
import { createAnimaClient } from '@/adapters/anima/client'
import { AnimaReadAdapter } from '@/adapters/anima/read-adapter'
import { redact } from '@/adapters/anima/redact'
import { emptyCursor, isSyncSite, MemorySyncCursorRepository, type SyncCursor } from '@/sync/cursor'
import { summarizeChangedRecords } from '@/sync/diff'
import { assertLiveReadOnlyEnv, isSyntheticPatientId } from '@/sync/live-env'
import { runSyncPass, type SyncPassResult, type SyncReadPort } from '@/sync/pull'
import { isTransientSyncError } from '@/sync/scheduler'

const BASE = process.env.ANIMA_SIM_BASE_URL ?? 'https://sim.animahacks.com'
const KEY = process.env.ANIMA_SIM_API_KEY

try {
  assertLiveReadOnlyEnv(process.env)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

async function listPatientIds(client: ReturnType<typeof createAnimaClient>): Promise<string[]> {
  const requested = process.env.SYNC_PATIENT_ID
  if (requested) {
    if (!isSyntheticPatientId(requested)) {
      throw new Error(`SYNC_PATIENT_ID must be a synthetic SIM-* id, got ${requested}`)
    }
    return [requested]
  }
  if (process.env.SYNC_ALL_PATIENTS !== '1') {
    return ['SIM-000001']
  }

  const ids: string[] = []
  for (let offset = 0; offset < 20 * 50; offset += 50) {
    const page = await client.request<unknown>(`/api/sites/gp/patients?offset=${offset}&limit=50`)
    if (page.status !== 200) {
      throw new Error(`list patients failed: ${page.status}`)
    }
    const body = page.body as { patients?: { id: string }[]; items?: { id: string }[] } | { id: string }[]
    const items = Array.isArray(body) ? body : (body.patients ?? body.items ?? [])
    if (!items.length) break
    ids.push(...items.map((patient) => patient.id).filter(isSyntheticPatientId))
    if (items.length < 50) break
  }
  return ids
}

async function onePass(
  read: SyncReadPort,
  store: MemorySyncCursorRepository,
  started: SyncCursor,
): Promise<SyncPassResult> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const cursor = (await store.get(started)) ?? started
      return await runSyncPass(read, cursor, { store })
    } catch (error) {
      lastError = error
      if (!isTransientSyncError(error) || attempt === 3) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 400))
    }
  }
  throw lastError
}

async function main() {
  const client = createAnimaClient({ apiKey: KEY, baseUrl: BASE })
  const read = new AnimaReadAdapter(client)
  const store = new MemorySyncCursorRepository()

  const team = await read.getTeam()
  const clock = await read.getClock()
  const patients = await listPatientIds(client)
  const sites = team.scopes.filter(isSyncSite)

  console.log(
    JSON.stringify(
      redact({
        team: { team: team.team, world: team.world, scopes: team.scopes },
        clock: { now: clock.now, paused: clock.paused, speed: clock.speed },
        patients,
        sites,
      }),
    ),
  )

  for (const patientId of patients) {
    for (const site of sites) {
      const started = emptyCursor(
        { world: team.world, team: team.team, site, patientId },
        clock,
      )
      const pass = await onePass(read, store, started)
      console.log(
        JSON.stringify(
          redact({
            patientId,
            site,
            pulled: pass.records.length,
            changed: pass.changes.length,
            pages: pass.pages,
            highWaterSimulatorTime: pass.cursor.highWaterSimulatorTime,
            pageOffset: pass.cursor.pageOffset,
            seen: Object.keys(pass.cursor.seen).length,
            changes: summarizeChangedRecords(pass.records),
          }),
        ),
      )
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  const safe = KEY && message.includes(KEY) ? message.split(KEY).join('[redacted]') : message
  console.error('sync-once failed:', safe)
  process.exit(1)
})
