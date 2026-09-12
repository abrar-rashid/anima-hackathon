import { NextResponse } from 'next/server'
import type { ActionProposal } from '@/ctl/contracts'
import { loadLiveActionSchema } from '@/ctl/effect/action-schema'
import { executeProposal } from '@/ctl/effect/execute'
import { ExecuteRequest } from '@/ctl/effect/wire'

export const runtime = 'nodejs'

/**
 * Perform an approved write.
 *
 * The approval gate is enforced here, not in the UI. A disabled button is a
 * courtesy to the human; this route refuses the request outright when the
 * proposal carries a hard stop, when the action is not exposed by the live
 * schema, or when the client claims support the live document does not confirm.
 *
 * Live writes take about six seconds, so callers should expect to wait.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let proposal: ActionProposal
  let staff: { id: string; name: string; role: string } | undefined
  try {
    const raw: unknown = await request.json().catch(() => ({}))
    const parsed = ExecuteRequest.parse(raw)
    proposal = parsed.proposal as ActionProposal
    staff = parsed.staff
  } catch (error) {
    return NextResponse.json(
      { error: 'invalid proposal', detail: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    )
  }

  if (proposal.hardStops.length > 0) {
    return NextResponse.json(
      {
        error: 'refused',
        reason: `the proposal carries hard stops: ${proposal.hardStops.join(', ')}`,
        hardStops: proposal.hardStops,
      },
      { status: 409 },
    )
  }

  // `supported` is re-derived: a client could assert it.
  const schema = await loadLiveActionSchema()
  if (!schema) {
    return NextResponse.json(
      {
        error: 'refused',
        reason:
          'the live OpenAPI document could not be read, so the action type cannot be verified against the API',
        hardStops: ['unsupported-action'],
      },
      { status: 409 },
    )
  }
  if (!proposal.supported || !schema.actionTypes.includes(proposal.actionType)) {
    return NextResponse.json(
      {
        error: 'refused',
        reason: `the live schema does not expose the action type ${proposal.actionType}`,
        hardStops: ['unsupported-action'],
      },
      { status: 409 },
    )
  }

  const receipt = await executeProposal(proposal, {
    deps: { loadSchema: async () => schema },
    // Identity is app-side; it is never written into the record as source data.
    requiresStaffIdentity: staff !== undefined,
    ...(staff ? { staff } : {}),
  })

  return NextResponse.json(receipt, {
    status: receipt.ok ? 200 : 409,
    headers: { 'X-CTL-Staff-Attribution': staff ? 'named-app-side' : 'team-level-only' },
  })
}
