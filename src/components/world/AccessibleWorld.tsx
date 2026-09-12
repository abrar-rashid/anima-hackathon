import type { WorldSnapshot } from '@/world/types'
import { directionPhrase, formatSimulatorTime, THREAD_STATE_LABEL } from './format'
import styles from './instruments.module.css'

export type AccessibleWorldProps = {
  snapshot: WorldSnapshot
  sectionId?: string
}

export function AccessibleWorld({ snapshot, sectionId = 'world-as-data' }: AccessibleWorldProps) {
  const headingId = `${sectionId}-heading`
  return (
    <section className={styles.tables} id={sectionId} aria-labelledby={headingId}>
      <h2 id={headingId}>World as data</h2>
      <p>
        Keyboard-reachable tables of the same districts, results, threads and events drawn on the
        atlas. Nothing extra is added.
      </p>

      <div className={styles.tableWrap}>
        <table>
          <caption>Districts</caption>
          <thead>
            <tr>
              <th scope="col">District</th>
              <th scope="col">Team</th>
              <th scope="col">Owned entity ids</th>
              <th scope="col">Pending entity ids</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.districts.length === 0 ? (
              <tr>
                <td colSpan={4}>No districts in this snapshot.</td>
              </tr>
            ) : (
              snapshot.districts.map((district) => (
                <tr key={district.teamId} data-row-district={district.teamId}>
                  <th scope="row">{district.label}</th>
                  <td>{district.teamId}</td>
                  <td>{district.ownedEntityIds.join(', ') || 'none'}</td>
                  <td>{district.pendingEntityIds.join(', ') || 'none'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <caption>Results</caption>
          <thead>
            <tr>
              <th scope="col">Entity</th>
              <th scope="col">Case</th>
              <th scope="col">Patient</th>
              <th scope="col">Result</th>
              <th scope="col">Version</th>
              <th scope="col">Analyte</th>
              <th scope="col">Direction</th>
              <th scope="col">Owner</th>
              <th scope="col">Owner actor</th>
              <th scope="col">Ownership</th>
              <th scope="col">Closure</th>
              <th scope="col">Neglect minutes</th>
              <th scope="col">Manual chases</th>
              <th scope="col">Exceptions</th>
              <th scope="col">Duplicates suppressed</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.entities.length === 0 ? (
              <tr>
                <td colSpan={15}>No results in this snapshot.</td>
              </tr>
            ) : (
              snapshot.entities.map((entity) => (
                <tr key={entity.entityId} data-row-entity={entity.entityId}>
                  <th scope="row">{entity.entityId}</th>
                  <td>{entity.caseId}</td>
                  <td>{entity.patientId}</td>
                  <td>{entity.resultId}</td>
                  <td>{entity.resultVersion}</td>
                  <td>{entity.analyteName}</td>
                  <td>{directionPhrase(entity.direction)}</td>
                  <td>{entity.ownerTeamId}</td>
                  <td>{entity.ownerActorId ?? 'none'}</td>
                  <td>{entity.ownershipState}</td>
                  <td>{entity.closureState}</td>
                  <td>{entity.neglectMinutes}</td>
                  <td>{entity.manualChases}</td>
                  <td>{entity.exceptionCount}</td>
                  <td>{entity.duplicateSuppressed}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <caption>Threads</caption>
          <thead>
            <tr>
              <th scope="col">Thread</th>
              <th scope="col">Entity</th>
              <th scope="col">From</th>
              <th scope="col">To</th>
              <th scope="col">State</th>
              <th scope="col">Ack deadline</th>
              <th scope="col">Overdue minutes</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.threads.length === 0 ? (
              <tr>
                <td colSpan={7}>No threads in this snapshot.</td>
              </tr>
            ) : (
              snapshot.threads.map((thread) => (
                <tr key={thread.threadId} data-row-thread={thread.threadId}>
                  <th scope="row">{thread.threadId}</th>
                  <td>{thread.entityId}</td>
                  <td>{thread.fromTeamId}</td>
                  <td>{thread.toTeamId}</td>
                  <td>{THREAD_STATE_LABEL[thread.state]}</td>
                  <td>{thread.ackDeadlineAt === null ? 'none' : formatSimulatorTime(thread.ackDeadlineAt)}</td>
                  <td>{thread.overdueMinutes}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <caption>Events</caption>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Entity</th>
              <th scope="col">Simulator time</th>
              <th scope="col">Kind</th>
              <th scope="col">Detail</th>
              <th scope="col">District</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.events.length === 0 ? (
              <tr>
                <td colSpan={6}>No events in this snapshot.</td>
              </tr>
            ) : (
              snapshot.events.map((event) => (
                <tr key={event.eventId} data-row-event={event.eventId}>
                  <th scope="row">{event.eventId}</th>
                  <td>{event.entityId}</td>
                  <td>{formatSimulatorTime(event.simulatorTime)}</td>
                  <td>{event.kind}</td>
                  <td>{event.detail}</td>
                  <td>{event.districtId ?? 'none'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
