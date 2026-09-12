import Link from 'next/link'
import styles from './neighbourhood.module.css'
import { BREACH_LABEL, PLACE_SOURCE_LABEL, formatCount, formatSimTime, withDenominator } from './format'
import type { TownModel } from './model'

export interface AccessibleNeighbourhoodProps {
  model: TownModel
  sectionId?: string
}

/**
 * The map as data.
 *
 * Everything drawn on the canvas is also here as real DOM: the seven sites with
 * their counts and state, and the document trail with the scope chain each
 * event actually travels. Nothing on the canvas is unreachable from here, so
 * the view is not canvas-only.
 */
export function AccessibleNeighbourhood({
  model,
  sectionId = 'neighbourhood-as-data',
}: AccessibleNeighbourhoodProps) {
  const headingId = `${sectionId}-heading`

  return (
    <section className={styles.dataSection} id={sectionId} aria-labelledby={headingId}>
      <h2 id={headingId}>The neighbourhood as data</h2>
      <p>
        The same sites, counts and events drawn on the map, as keyboard-reachable tables. Simulator
        time is {formatSimTime(model.now)}. Unclosed means {model.unclosedRule}. Breach state is
        arithmetic on each record&apos;s own <code>dueAt</code>; it carries no clinical meaning.
      </p>
      <p>
        {withDenominator(model.scan.scanned, model.scan.total, 'resources scanned')} across{' '}
        {model.scan.sites.length} of {model.sites.length} sites
        {model.scan.failedSites.length > 0
          ? `; these reads failed: ${model.scan.failedSites.join(', ')}`
          : '; every site read succeeded'}
        .
      </p>

      <div className={styles.tableWrap}>
        <table>
          <caption>Sites drawn as buildings</caption>
          <thead>
            <tr>
              <th scope="col">Name on the sign</th>
              <th scope="col">Site id</th>
              <th scope="col">Where the sign name came from</th>
              <th scope="col">Catalogue name</th>
              <th scope="col">Catalogue subtitle</th>
              <th scope="col">Scanned</th>
              <th scope="col">Site total</th>
              <th scope="col">Unclosed</th>
              <th scope="col">Past deadline</th>
              <th scope="col">Due within 12h</th>
              <th scope="col">Read</th>
            </tr>
          </thead>
          <tbody>
            {model.sites.length === 0 ? (
              <tr>
                <td colSpan={11}>No site read returned data.</td>
              </tr>
            ) : (
              model.sites.map((site) => (
                <tr key={site.site} data-row-site={site.site}>
                  <th scope="row">{site.placeName ?? site.site}</th>
                  <td>
                    <code>{site.site}</code>
                  </td>
                  <td>{PLACE_SOURCE_LABEL[site.placeNameSource]}</td>
                  <td>{site.name ?? 'not supplied by source'}</td>
                  <td>{site.subtitle ?? 'not supplied by source'}</td>
                  <td>{formatCount(site.scanned)}</td>
                  <td>{formatCount(site.total)}</td>
                  <td>{formatCount(site.work.length)}</td>
                  <td>{formatCount(site.breachedCount)}</td>
                  <td>{formatCount(site.dueSoonCount)}</td>
                  <td>{site.readFailed ? (site.readError ?? 'failed') : 'ok'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <caption>Unclosed records above each building</caption>
          <thead>
            <tr>
              <th scope="col">Resource</th>
              <th scope="col">Site</th>
              <th scope="col">Kind</th>
              <th scope="col">Title</th>
              <th scope="col">Status</th>
              <th scope="col">Owner</th>
              <th scope="col">Source priority</th>
              <th scope="col">Due</th>
              <th scope="col">Deadline state</th>
              <th scope="col">Patient</th>
            </tr>
          </thead>
          <tbody>
            {model.sites.every((site) => site.work.length === 0) ? (
              <tr>
                <td colSpan={10}>No unclosed record in the scanned windows.</td>
              </tr>
            ) : (
              model.sites.flatMap((site) =>
                site.work.map((item) => (
                  <tr key={`${site.site}-${item.resourceId}`} data-row-work={item.resourceId}>
                    <th scope="row">
                      <code>
                        {item.resourceId} v{item.version}
                      </code>
                    </th>
                    <td>{site.placeName ?? site.site}</td>
                    <td>{item.kind}</td>
                    <td>{item.title || 'no title supplied by source'}</td>
                    <td>{item.status}</td>
                    <td>{item.owner ?? 'not supplied by source'}</td>
                    <td>{item.priority ?? 'not supplied by source'}</td>
                    <td>{item.dueAt === null ? 'not supplied by source' : formatSimTime(item.dueAt)}</td>
                    <td>{BREACH_LABEL[item.breach]}</td>
                    <td>
                      {item.patientId ? (
                        <Link href={`/patient/${item.patientId}`}>{item.patientId}</Link>
                      ) : (
                        'not supplied by source'
                      )}
                    </td>
                  </tr>
                )),
              )
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <caption>The paper trail: events and the scope chain each one travels</caption>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Simulator time</th>
              <th scope="col">Type</th>
              <th scope="col">Actor</th>
              <th scope="col">Detail</th>
              <th scope="col">Visible to, in order</th>
              <th scope="col">Drawn as</th>
              <th scope="col">Patient</th>
              <th scope="col">Resource</th>
            </tr>
          </thead>
          <tbody>
            {model.docs.length === 0 ? (
              <tr>
                <td colSpan={9}>No event returned by the clock read.</td>
              </tr>
            ) : (
              model.docs.map((doc) => (
                <tr key={doc.eventId} data-row-doc={doc.eventId}>
                  <th scope="row">
                    <code>{doc.eventId}</code>
                  </th>
                  <td>{formatSimTime(doc.time)}</td>
                  <td>{doc.type}</td>
                  <td>{doc.actor ?? 'not supplied by source'}</td>
                  <td>{doc.detail ?? 'not supplied by source'}</td>
                  <td>{doc.chain.join(' → ')}</td>
                  <td>
                    {doc.routed.length >= 2
                      ? `document travelling ${doc.routed.join(' → ')}`
                      : 'not drawn: fewer than two scopes have a place on the map'}
                  </td>
                  <td>
                    {doc.patientId ? (
                      <Link href={`/patient/${doc.patientId}`}>{doc.patientId}</Link>
                    ) : (
                      'not supplied by source'
                    )}
                  </td>
                  <td>{doc.resourceId ? <code>{doc.resourceId}</code> : 'not supplied by source'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <caption>Patients referenced by the scanned resources</caption>
          <thead>
            <tr>
              <th scope="col">Patient</th>
              <th scope="col">Site</th>
              <th scope="col">Name</th>
              <th scope="col">Resources in window</th>
            </tr>
          </thead>
          <tbody>
            {model.sites.every((site) => site.patients.length === 0) ? (
              <tr>
                <td colSpan={4}>No scanned resource carries a patient id.</td>
              </tr>
            ) : (
              model.sites.flatMap((site) =>
                site.patients.map((patient) => (
                  <tr key={`${site.site}-${patient.patientId}`}>
                    <th scope="row">
                      <Link href={`/patient/${patient.patientId}`}>{patient.patientId}</Link>
                    </th>
                    <td>{site.placeName ?? site.site}</td>
                    <td>{patient.name ?? 'not in the directory page this view read'}</td>
                    <td>{formatCount(patient.resourceCount)}</td>
                  </tr>
                )),
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
