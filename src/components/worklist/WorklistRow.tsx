import type { ReactElement } from 'react'
import Link from 'next/link'
import { StateBadge, Text } from '@/design'
import type { StateTone } from '@/design'
import { NOT_SUPPLIED, type Finding, type SimPatient, type SiteDescriptor } from '@/ctl/contracts'
import { ageFrom } from '@/ctl/normalise/resources'
import { absent, formatOverdue } from './format'
import styles from './worklist-row.module.css'

const BREACH_TONE: Record<Finding['breach'], StateTone> = {
  breached: 'blocked',
  'due-soon': 'awaiting',
  'on-time': 'proven',
  'no-deadline': 'unverified',
}

function patientLine(finding: Finding, patient: SimPatient | undefined, now: number): string {
  if (!finding.patientId) return absent('patient')
  if (!patient) return `${finding.patientId} · ${absent('name')}`
  const age = now > 0 ? ageFrom(patient.birthDate, now) : undefined
  const ageLabel = age === undefined ? absent('age') : String(age)
  return `${patient.name}, ${ageLabel}`
}

export function WorklistRow({
  finding,
  patient,
  siteName,
  now,
}: {
  finding: Finding
  patient: SimPatient | undefined
  siteName: string | undefined
  now: number
}): ReactElement {
  const href = finding.patientId ? `/patient/${finding.patientId}` : undefined
  const owner = finding.owner ?? NOT_SUPPLIED
  const siteLabel = siteName ?? `${finding.site} · ${absent('name')}`

  const identity = (
    <p className={styles.name}>
      {href ? <Link href={href}>{patientLine(finding, patient, now)}</Link> : patientLine(finding, patient, now)}
    </p>
  )

  return (
    <article className={styles.row} data-finding={finding.id}>
      <div className={styles.who}>
        {identity}
        <p className={styles.summary}>{finding.summary}</p>
      </div>
      <div className={styles.meta}>
        <p className={styles.overdue}>{formatOverdue(finding.overdueMs, finding.breach)}</p>
        <Text as="p" size="meta" tone="muted">
          Owner {owner}
        </Text>
        <div className={styles.chips}>
          <StateBadge tone={BREACH_TONE[finding.breach]} label={siteLabel} />
          <Text as="span" size="meta" data>
            {finding.detector}
          </Text>
          <Text as="span" size="meta" tone="muted">
            {finding.priority ?? absent('priority')}
          </Text>
        </div>
      </div>
      {href ? (
        <Link className={styles.action} href={href}>
          Open loop
        </Link>
      ) : (
        <span className={styles.action} aria-disabled="true">
          Open loop
        </span>
      )}
    </article>
  )
}
