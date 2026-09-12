'use client'

import { useState, type ReactElement } from 'react'
import { Button, Heading, Stack, StateBadge, Surface, Text } from '@/design'
import type { ActionProposal, ActionReceipt, SimResource, SiteDescriptor } from '@/ctl/contracts'
import { CitationDisclosure } from './CitationDisclosure'
import { formatHardStop } from './format'
import { siteLabel } from './site-label'
import type { ProposalOutcome } from './types'
import styles from './effectuator-drawer.module.css'

/** The execute route's response carries a couple of fields beyond `ActionReceipt`. */
interface ExecuteResponse extends ActionReceipt {
  readbackChecks?: { name: string; ok: boolean; expected: string; actual: string }[]
  elapsedMs?: number
  error?: string
  reason?: string
}

type ApprovalState =
  | { phase: 'idle' }
  | { phase: 'pending' }
  | { phase: 'done'; receipt: ExecuteResponse }
  | { phase: 'failed'; message: string }

/**
 * The human approval gate for one proposed write.
 *
 * Nothing here executes anything: the button POSTs to `/api/ctl/execute`,
 * owned separately, which re-derives hard stops and schema support itself and
 * refuses the request outright if either fails. This drawer only decides
 * whether to *offer* the button, and shows the full payload so the approval
 * is informed rather than a rubber stamp.
 */
export function EffectuatorDrawer({
  outcome,
  resources,
  sites,
}: {
  outcome: ProposalOutcome
  resources: SimResource[]
  sites: SiteDescriptor[]
}): ReactElement {
  const [state, setState] = useState<ApprovalState>({ phase: 'idle' })
  const proposal = outcome.proposal

  async function approve(current: ActionProposal): Promise<void> {
    setState({ phase: 'pending' })
    try {
      const response = await fetch('/api/ctl/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal: current }),
      })
      const body = (await response.json().catch(() => ({}))) as ExecuteResponse
      setState({ phase: 'done', receipt: body })
    } catch (error) {
      setState({
        phase: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <Surface as="section" elevation="raised" padding="lg" labelledBy="effectuator-heading">
      <Stack gap="md">
        <Heading as="h2" size="title" id="effectuator-heading">
          Proposed action
        </Heading>

        {!proposal ? (
          <Text as="p" tone="muted">
            {outcome.reason ?? 'No action is proposed for this patient right now.'}
          </Text>
        ) : (
          <Stack gap="md">
            <Text as="p" size="body">
              {proposal.actionType} at {siteLabel(proposal.site, sites)}
            </Text>
            <Text as="p" size="meta" tone="muted">
              {proposal.rationale}
            </Text>

            <div className={styles.citations}>
              {proposal.citations.map((citation) => (
                <CitationDisclosure
                  key={`${citation.resourceId}:${citation.version}`}
                  citation={citation}
                  resources={resources}
                  sites={sites}
                  triggerLabel="View cited source"
                />
              ))}
            </div>

            <details className={styles.payload}>
              <summary>Exact payload to be sent</summary>
              <pre>{JSON.stringify(proposal.payload, null, 2)}</pre>
              <dl className={styles.meta}>
                <dt>Idempotency key</dt>
                <dd>{proposal.idempotencyKey}</dd>
                <dt>Source versions</dt>
                <dd>{proposal.sourceVersions.map((v) => `${v.id}@v${v.version}`).join(', ')}</dd>
              </dl>
            </details>

            {proposal.hardStops.length > 0 ? (
              <Stack gap="xs">
                <StateBadge tone="blocked" label="Approval disabled" />
                <ul className={styles.hardStops}>
                  {proposal.hardStops.map((stop) => (
                    <li key={stop}>
                      <Text as="p" size="meta" tone="blocked">
                        {formatHardStop(stop)}
                      </Text>
                    </li>
                  ))}
                </ul>
              </Stack>
            ) : (
              <Button
                variant="primary"
                busy={state.phase === 'pending'}
                disabled={state.phase === 'pending'}
                onClick={() => void approve(proposal)}
              >
                Approve and send
              </Button>
            )}

            {state.phase === 'pending' ? (
              <Text as="p" size="meta" tone="awaiting">
                Sending to the live simulator. Writes take about six seconds; the outcome is not yet proven.
              </Text>
            ) : null}

            {state.phase === 'failed' ? (
              <Text as="p" size="meta" tone="blocked">
                The request failed before a receipt was returned: {state.message}
              </Text>
            ) : null}

            {state.phase === 'done' ? <ReceiptPanel receipt={state.receipt} /> : null}
          </Stack>
        )}
      </Stack>
    </Surface>
  )
}

function ReceiptPanel({ receipt }: { receipt: ExecuteResponse }): ReactElement {
  if (receipt.error || receipt.reason) {
    return (
      <Stack gap="xs">
        <StateBadge tone="blocked" label="Refused" />
        <Text as="p" size="meta" tone="blocked">
          {receipt.reason ?? receipt.error}
        </Text>
      </Stack>
    )
  }

  return (
    <Stack gap="xs">
      <StateBadge
        tone={receipt.provenByReadback ? 'proven' : 'unverified'}
        label={receipt.provenByReadback ? 'Proven by readback' : `HTTP ${receipt.httpStatus} — not yet proven`}
      />
      <Text as="p" size="meta" tone="muted">
        {receipt.message ?? `Status ${receipt.httpStatus} for ${receipt.actionType}.`}
        {typeof receipt.elapsedMs === 'number' ? ` Took ${Math.round(receipt.elapsedMs / 1000)}s.` : ''}
      </Text>
      {!receipt.provenByReadback ? (
        <Text as="p" size="meta" tone="unverified">
          HTTP success alone is not proof: a re-read did not confirm the expected change.
        </Text>
      ) : null}
    </Stack>
  )
}
