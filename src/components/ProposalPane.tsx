import styles from './case-workspace.module.css'

export type ProposalActionView = {
  kind: string
  site: string
  payload: unknown
  expectedReadback: string
  sourceVersions: { id: string; version: number }[]
  idempotencyKey: string
  supported: boolean
  label: 'live' | 'Protocol preview'
  requiresSeparateApproval?: boolean
  blockedReason?: string
}

export type ProposalStaff = {
  id: string
  name: string
  role: string
  teamId: string
}

export type ProposalPaneProps = {
  currentOwner: string
  nextOwner: string
  orderingTeamId?: string
  requestedReceiver?: string | null
  transfer: { toTeam: string; mode: string; toActorId?: string }
  deadlines: { ackDeadlineAt: number | null; policySource: string }
  actions: ProposalActionView[]
  prohibited: { field: string; reason: string }[]
  hardStops: string[]
  staffRoster: ProposalStaff[]
  selectedStaffId: string | null
  onStaffChange: (id: string) => void
  onApprove: (actionIndexes: number[]) => void
  includedIndexes?: number[]
  onToggleIncluded?: (index: number) => void
}

function payloadResourceId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const id = (payload as { resourceId?: unknown }).resourceId
  return typeof id === 'string' && id.trim().length > 0 ? id : undefined
}

function isExecutable(action: ProposalActionView): boolean {
  if (!action.supported || action.label !== 'live') return false
  if (action.blockedReason) return false
  if (action.kind === 'accept' && !payloadResourceId(action.payload)) return false
  return true
}

function defaultIncludedIndexes(actions: ProposalActionView[]): number[] {
  const executable = actions
    .map((action, index) => (isExecutable(action) ? index : -1))
    .filter((index) => index >= 0)
  const accepts = executable.filter((index) => actions[index]?.kind === 'accept')
  if (accepts.length > 0) return accepts
  return executable.filter((index) => actions[index]?.kind !== 'accept')
}

export function ProposalPane(props: ProposalPaneProps) {
  const included = props.includedIndexes ?? defaultIncludedIndexes(props.actions)
  const accept = props.actions.find((action) => action.kind === 'accept')
  const twoStep = Boolean(accept && accept.label === 'live')
  const acceptReady = Boolean(accept && isExecutable(accept))
  const selected = props.staffRoster.find((staff) => staff.id === props.selectedStaffId)
  const receiverRequired = included.some((index) => props.actions[index]?.kind === 'accept')
  const receiverMismatch = Boolean(
    receiverRequired && props.requestedReceiver && selected && selected.teamId !== props.requestedReceiver,
  )
  const approveDisabled = props.hardStops.length > 0 || !props.selectedStaffId || receiverMismatch
  const orderingTeam = props.orderingTeamId ?? props.currentOwner
  const receivingTeam = props.requestedReceiver ?? props.nextOwner

  return (
    <section className={styles.panel} aria-labelledby="proposal-heading">
      <h2 id="proposal-heading">Proposed covenant</h2>
      <div className={styles.stack}>
        {twoStep ? (
          <p className={styles.step}>
            <span aria-hidden="true">{acceptReady ? '②' : '①'}</span>{' '}
            {acceptReady
              ? `Step 2 of 2. The receiving team (${receivingTeam}) must approve accept. The ordering team cannot accept on the receiver's behalf.`
              : `Step 1 of 2. The ordering team (${orderingTeam}) requests the transfer with create_task. Accountability stays with the ordering team until the receiving team (${receivingTeam}) accepts.`}
          </p>
        ) : null}
        <p>Current owner: {props.currentOwner}</p>
        <p>Next owner: {props.nextOwner}</p>
        <p>
          Transfer to {props.transfer.toTeam} ({props.transfer.mode}
          {props.transfer.toActorId ? `, ${props.transfer.toActorId}` : ''})
        </p>
        <p>
          Acknowledgement deadline <span>{props.deadlines.ackDeadlineAt ?? 'not set'}</span>. Policy
          source: {props.deadlines.policySource}
        </p>
        <ul className={styles.list} aria-label="Proposed actions">
          {props.actions.map((action, index) => {
            const executable = isExecutable(action)
            return (
              <li key={`${action.kind}-${action.site}-${index}`} className={styles.row} aria-label={`${action.kind} to ${action.site}`}>
                <p>
                  {action.kind} → {action.site}
                </p>
                {executable ? (
                  <label>
                    <input
                      type="checkbox"
                      checked={included.includes(index)}
                      onChange={() => props.onToggleIncluded?.(index)}
                    />{' '}
                    Include {action.kind}
                  </label>
                ) : action.label === 'Protocol preview' ? (
                  <p>Protocol preview</p>
                ) : (
                  <p>
                    {action.blockedReason ??
                      'Accept is a separate receiving-team approval and is not executable yet.'}
                  </p>
                )}
                <p>{action.expectedReadback}</p>
                <p>
                  Included versions:{' '}
                  {action.sourceVersions.map((version) => `${version.id} v${version.version}`).join(', ')}
                </p>
                <p>{action.idempotencyKey ? 'Idempotency key issued' : 'Idempotency key missing'}</p>
                <pre>{JSON.stringify(action.payload, null, 2)}</pre>
              </li>
            )
          })}
        </ul>
        {props.prohibited.length > 0 ? (
          <div>
            <h3>Clinical rows</h3>
            <ul className={styles.list} aria-label="Clinical rows">
              {props.prohibited.map((row) => (
                <li key={row.field} className={`${styles.row} ${styles.locked}`}>
                  <span>{row.field}</span>
                  <button type="button" disabled>
                    {row.reason}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {props.hardStops.length > 0 ? (
          <div>
            <h3>Hard stops</h3>
            <ul aria-label="Hard stops">
              {props.hardStops.map((stop) => (
                <li key={stop}>{stop}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <label className={styles.staffLabel}>
          App-side staff attribution (simulator records team-level actor)
          <select
            value={props.selectedStaffId ?? ''}
            onChange={(event) => props.onStaffChange(event.target.value)}
          >
            <option value="">Select staff identity</option>
            {props.staffRoster.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name} · {staff.role} · {staff.teamId}
              </option>
            ))}
          </select>
        </label>
        {receiverRequired ? (
          <p>
            Receiving team ({receivingTeam}) approval is required. The ordering team cannot accept on
            the receiver&apos;s behalf.
          </p>
        ) : null}
        <button
          type="button"
          className={styles.primary}
          disabled={approveDisabled}
          onClick={() => props.onApprove(included)}
        >
          Approve covenant actions
        </button>
      </div>
    </section>
  )
}
