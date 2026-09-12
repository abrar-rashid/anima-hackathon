import type { ReactElement } from 'react'
import { DataList, Heading, Stack, StateBadge, Surface, Text } from '@/design'
import type { SimPatient } from '@/ctl/contracts'
import { ageFrom } from '@/ctl/normalise/resources'
import { absent, formatAge, formatLocalIdLabel } from './format'
import styles from './patient-header.module.css'

/**
 * The patient banner.
 *
 * Every value here is either read straight off `SimPatient` or computed with
 * `ageFrom`, which is pure arithmetic on `birthDate`. There is deliberately no
 * NHS number field: the simulator's patient record has none, and the surface
 * this replaces invented one. If a caller adds one later without a source
 * field to back it, `honesty.test.tsx` will fail.
 */
export function PatientHeader({
  patientId,
  patient,
  now,
  lookupError,
}: {
  patientId: string
  patient: SimPatient | null
  now: number
  lookupError?: string
}): ReactElement {
  if (!patient) {
    return (
      <Surface as="section" elevation="raised" padding="lg" labelledBy="patient-header-heading">
        <Stack gap="sm">
          <StateBadge tone="blocked" label="Patient record unavailable" />
          <Heading as="h1" size="hero" id="patient-header-heading">
            {patientId}
          </Heading>
          <Text as="p" tone="muted">
            {lookupError
              ? `The patient directory could not be read (${lookupError}). No name was invented.`
              : `No patient record with this ID was returned by the directory. No name was invented.`}
          </Text>
        </Stack>
      </Surface>
    )
  }

  const age = ageFrom(patient.birthDate, now)
  const localIdEntries = Object.entries(patient.localIds)

  return (
    <Surface as="section" elevation="raised" padding="lg" labelledBy="patient-header-heading">
      <Stack gap="md">
        <Stack gap="xs">
          {patient.synthetic ? (
            <StateBadge tone="unverified" label="Synthetic patient · simulator data only" />
          ) : (
            <StateBadge tone="unverified" label="Simulator patient · synthetic-flag not-supplied-by-source" />
          )}
          <Heading as="h1" size="hero" id="patient-header-heading">
            {patient.name}
          </Heading>
          <Text as="p" size="meta" tone="muted">
            {patient.id} · {patient.birthDate ? `born ${patient.birthDate}, age ${formatAge(age)}` : absent('date of birth')}
          </Text>
          <Text as="p" size="meta" tone="muted" data>
            No NHS number is shown: the simulator does not supply one for this patient.
          </Text>
        </Stack>

        <div className={styles.grid}>
          <DataList
            items={[
              {
                term: 'Conditions',
                description: patient.conditions.length > 0 ? patient.conditions.join(', ') : absent('conditions'),
              },
              {
                term: 'Care goals',
                description: patient.goals.length > 0 ? patient.goals.join(', ') : absent('care goals'),
              },
              {
                term: 'Needs',
                description: patient.needs.length > 0 ? patient.needs.join(', ') : absent('needs'),
              },
            ]}
          />
          <DataList
            items={
              localIdEntries.length > 0
                ? localIdEntries.map(([site, id]) => ({
                    term: formatLocalIdLabel(site),
                    description: id,
                  }))
                : [{ term: 'Cross-site local IDs', description: absent('local IDs') }]
            }
          />
        </div>
      </Stack>
    </Surface>
  )
}
