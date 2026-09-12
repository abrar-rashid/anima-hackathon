import 'server-only'

import type { Finding, SimResource } from '@/ctl/contracts'
import { loadLiveActionSchema } from '@/ctl/effect/action-schema'
import { proposeForFinding } from '@/ctl/effect'
import { readTeam } from '@/anima/readers'
import type { ProposalOutcome } from './types'

/**
 * Builds a proposal for this patient's top-ranked finding, for display only.
 *
 * Mirrors `/api/ctl/propose`'s context assembly (live schema, our team id, the
 * cited resource as already read for this patient) rather than calling that
 * route over HTTP, since this already runs server-side during page assembly.
 * No write happens here; approval and execution stay behind
 * `POST /api/ctl/execute`, owned separately.
 */
export async function proposeTopProposal(
  findings: Finding[],
  resources: SimResource[],
  now: number,
): Promise<ProposalOutcome> {
  const topFinding = findings[0]
  if (!topFinding) {
    return { proposal: null, finding: null, reason: 'No findings for this patient to propose an action for.' }
  }

  try {
    const [team, schema] = await Promise.all([
      readTeam().catch(() => null),
      loadLiveActionSchema(),
    ])

    const citation = topFinding.citations[0]
    const source = citation
      ? resources.find((r) => r.id === citation.resourceId && r.site === citation.site)
      : undefined

    const proposal = proposeForFinding(topFinding, {
      source,
      now,
      team: team?.team ?? 'unknown-team',
      schema,
      requiresStaffIdentity: false,
    })

    return { proposal, finding: topFinding, reason: null }
  } catch (error) {
    return {
      proposal: null,
      finding: topFinding,
      reason: `Could not build a proposal for this finding (${String(error instanceof Error ? error.message : error)}).`,
    }
  }
}
