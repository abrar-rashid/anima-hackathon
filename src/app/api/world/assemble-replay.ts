import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WorldSeries } from '@/components/world'
import { loadPreflight, loadProtocol } from '@/services/case-service'
import type { EventEnvelope } from '@/domain/types'
import { replay } from '@/world/replay'

export type WorldReplayComparison = {
  left: WorldSeries
  right: WorldSeries
}

function loadAfterHoursTrace(): EventEnvelope[] {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'fixtures/traces/after-hours-timeout.json'), 'utf8'),
  ) as EventEnvelope[]
}

/**
 * Replay one immutable fixture trace under v3 and v4.
 * Headings are the protocol ids from the fixture files. Outcomes are computed.
 */
export function assembleReplayComparison(): WorldReplayComparison {
  const preflight = loadPreflight()
  const trace = loadAfterHoursTrace()
  const first = trace[0]
  if (first === undefined) {
    throw new Error('The after-hours timeout trace is empty. No society was invented.')
  }

  const caseSeed = { caseId: first.caseId, patientId: preflight.selectedPatientId }

  const v3 = loadProtocol('v3')
  const v4 = loadProtocol('v4')

  return {
    left: {
      heading: `Protocol ${v3.id}`,
      snapshots: replay({
        trace,
        protocol: v3,
        caseSeed,
        world: preflight.world,
        capturedAt: preflight.capturedAt,
      }),
    },
    right: {
      heading: `Protocol ${v4.id}`,
      snapshots: replay({
        trace,
        protocol: v4,
        caseSeed,
        world: preflight.world,
        capturedAt: preflight.capturedAt,
      }),
    },
  }
}
