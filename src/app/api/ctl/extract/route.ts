import { NextResponse } from 'next/server'
import type { SimResource } from '@/ctl/contracts'
import { extractTasksDetailed } from '@/ctl/extract/extract'
import { ExtractRequest } from '@/ctl/effect/wire'
import { readPatientAcrossSites } from '@/anima/readers'

export const runtime = 'nodejs'

/**
 * Extract candidate tasks from one patient's free text.
 *
 * The body is the `ExtractedTask[]` array. When the array is empty because the
 * layer degraded — no key, a model error, no free text, or every candidate
 * rejected by the guards — the reason and the counts come back in headers
 * rather than as a fabricated task. Never a 500 into the page.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let patientId: string
  try {
    const raw: unknown = await request.json().catch(() => ({}))
    patientId = ExtractRequest.parse(raw).patientId
  } catch (error) {
    return NextResponse.json(
      { error: 'invalid request', detail: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    )
  }

  let resources: SimResource[]
  let failedSites: string[]
  try {
    const read = await readPatientAcrossSites(patientId)
    resources = read.slices.flatMap((slice) => slice.resources)
    failedSites = read.failedSites
  } catch (error) {
    return NextResponse.json([], {
      headers: {
        'X-CTL-Extract-Reason': headerSafe(
          `could not read this patient's records: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      },
    })
  }

  const outcome = await extractTasksDetailed(resources.filter((r) => r.patientId === patientId))

  const headers: Record<string, string> = {
    'X-CTL-Extract-Model': outcome.model,
    'X-CTL-Extract-Spans': String(outcome.spansRead),
    'X-CTL-Extract-Resources': String(outcome.resourcesRead),
    'X-CTL-Extract-Rejected': String(outcome.rejected.length),
    'X-CTL-Extract-Derived-Deadlines': String(outcome.derivations.length),
  }
  if (failedSites.length > 0) headers['X-CTL-Extract-Failed-Sites'] = failedSites.join(',')
  if (outcome.reason) headers['X-CTL-Extract-Reason'] = headerSafe(outcome.reason)

  return NextResponse.json(outcome.tasks, { headers })
}

/** A model error can be multi-line; a header value cannot. */
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, 800)
}
