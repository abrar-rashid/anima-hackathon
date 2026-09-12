import styles from './case-workspace.module.css'
import { StateBadge } from './StateBadge'

export type CaseHeaderReplay = {
  label: 'Recorded simulator replay'
  world: string
  capturedAt: string
}

export type CaseHeaderProps = {
  patientName: string
  patientId: string
  resultId: string
  resultVersion: number
  classificationRuleText: string
  analyteName: string
  value: number
  unit: string
  referenceLow: number
  referenceHigh: number
  direction: 'above' | 'below'
  orderingTeamId: string
  currentAccountableOwner: string
  requestedReceiver: string | null
  acceptingActorName: string | null
  simulatorNow: number
  protocolId: string
  connectionLive: boolean
  replay: CaseHeaderReplay | null
}

export function CaseHeader(props: CaseHeaderProps) {
  const owner = props.currentAccountableOwner.trim() || 'unknown — owner missing from snapshot'
  const directionText =
    props.direction === 'above'
      ? 'above the reference range supplied by the source'
      : 'below the reference range supplied by the source'

  return (
    <header className={styles.header}>
      <p className={styles.kicker}>Care Covenant · synthetic simulator</p>
      <h1 className={styles.title}>{props.patientName}</h1>
      <p className={styles.patientId}>{props.patientId}</p>
      <p className={styles.resultId}>
        <span>{props.resultId}</span> <span>v{props.resultVersion}</span>
      </p>
      <p className={styles.owner}>Current accountable owner: {owner}</p>
      <dl className={styles.meta}>
        <div>
          <dt>Ordering team</dt>
          <dd>{props.orderingTeamId}</dd>
        </div>
        <div>
          <dt>Requested receiver</dt>
          <dd>{props.requestedReceiver ?? 'not requested'}</dd>
        </div>
        <div>
          <dt>Accepting actor</dt>
          <dd>{props.acceptingActorName ?? 'none recorded'}</dd>
        </div>
        <div>
          <dt>Simulator time</dt>
          <dd>
            <span>{new Date(props.simulatorNow).toISOString()}</span>
            {' · '}
            <span>{props.simulatorNow}</span>
          </dd>
        </div>
        <div>
          <dt>Protocol</dt>
          <dd>{props.protocolId}</dd>
        </div>
        <div>
          <dt>Connection</dt>
          <dd>
            {props.connectionLive ? (
              <StateBadge label="Live" icon="●" tone="ok" />
            ) : props.replay ? (
              <StateBadge
                label={`${props.replay.label} · ${props.replay.world} · ${props.replay.capturedAt}`}
                icon="◐"
                tone="warn"
              />
            ) : (
              <StateBadge label="Connection unknown" icon="?" tone="warn" />
            )}
          </dd>
        </div>
        <div>
          <dt>Source classification</dt>
          <dd>
            {props.analyteName} {props.value} {props.unit} (reference {props.referenceLow}–
            {props.referenceHigh}), {directionText}
          </dd>
        </div>
      </dl>
      <p className={styles.rule}>{props.classificationRuleText}</p>
    </header>
  )
}
