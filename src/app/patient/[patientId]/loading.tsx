import type { ReactElement } from 'react'
import { Skeleton, Stack } from '@/design'
import { AppShell } from '@/components/worklist/AppShell'

export default function PatientLoading(): ReactElement {
  return (
    <AppShell current="patient">
      <Stack gap="xl">
        <Skeleton label="Reading this patient across every site. Nothing is shown until it returns." bars={4} />
      </Stack>
    </AppShell>
  )
}
