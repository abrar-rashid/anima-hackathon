import type { ReactElement } from 'react'
import { AppShell } from '@/components/worklist/AppShell'
import { assemblePatientLoop } from '@/components/patient/assemble'
import { PatientLoopView } from '@/components/patient/PatientLoopView'
import type { PatientLoopSourced } from '@/components/patient/types'

export const dynamic = 'force-dynamic'

export default async function PatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}): Promise<ReactElement> {
  const { patientId } = await params
  const data = await assemblePatientLoop(patientId)
  const initial: PatientLoopSourced = { data, fetchedAt: Date.now(), stale: false }

  return (
    <AppShell current="patient" patientHref={`/patient/${patientId}`}>
      <PatientLoopView initial={initial} />
    </AppShell>
  )
}
