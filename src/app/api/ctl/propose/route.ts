import { NextResponse } from 'next/server'
import type { Finding, SimResource } from '@/ctl/contracts'
import { loadLiveActionSchema } from '@/ctl/effect/action-schema'
import { proposeForFinding, type ProposeContext } from '@/ctl/effect/mapping'
import { ProposeRequest } from '@/ctl/effect/wire'
import { readClock, readSiteView, readTeam } from '@/anima/readers'

export const runtime = 'nodejs'

/**
 * Build a proposal for a finding.
 *
 * Reads the cited resource live rather than trusting the finding's copy of it,
 * so the versions a human approves are the versions that existed a moment ago.
 * Nothing is written here.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let finding: Finding
  let staff: { id: string; name: string; role: string } | undefined
  try {
    const raw: unknown = await request.json().catch(() => ({}))
    const parsed = ProposeRequest.parse(raw)
    finding = parsed.finding as Finding
    staff = parsed.staff
  } catch (error) {
    return NextResponse.json(
      { error: 'invalid finding', detail: message(error) },
      { status: 400 },
    )
  }

  try {
    const [team, clock, schema, source] = await Promise.all([
      readTeam().catch(() => null),
      readClock().catch(() => null),
      loadLiveActionSchema(),
      readCitedResource(finding),
    ])

    const ctx: ProposeContext = {
      now: clock?.clock.now ?? finding.createdAt ?? 0,
      team: team?.team ?? 'unknown-team',
      schema,
      // Identity is app-side and optional in this build: the simulator's
      // `Action` has no staff field and attribution is team-level, so a named
      // approver can be required only when the caller has one to supply. The
      // header states which of the two happened rather than leaving it implied.
      requiresStaffIdentity: staff !== undefined,
      ...(staff ? { staff } : {}),
      ...(source ? { source } : {}),
    }

    const proposal = proposeForFinding(finding, ctx)
    return NextResponse.json(proposal, {
      headers: {
        'X-CTL-Schema-Verified': schema ? 'live' : 'unavailable',
        'X-CTL-Source-Revalidated': source ? 'yes' : 'no',
        'X-CTL-Staff-Attribution': staff ? 'named-app-side' : 'team-level-only',
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'propose failed', detail: message(error) }, { status: 502 })
  }
}

/** The resource the finding cites, read from its own site. */
async function readCitedResource(finding: Finding): Promise<SimResource | undefined> {
  const citation = finding.citations[0]
  if (!citation) return undefined
  try {
    const slice = await readSiteView(citation.site, {
      ...(finding.patientId ? { patient: finding.patientId } : {}),
      limit: 300,
    })
    return slice.resources.find((resource) => resource.id === citation.resourceId)
  } catch {
    return undefined
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
