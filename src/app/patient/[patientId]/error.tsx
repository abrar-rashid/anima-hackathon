'use client'

import type { ReactElement } from 'react'
import { AppShell } from '@/components/worklist/AppShell'
import { ErrorState } from '@/design'

export default function PatientError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}): ReactElement {
  return (
    <AppShell current="patient">
      <ErrorState
        title="This patient could not be loaded"
        body={error.message || 'An unexpected error stopped the read. No record was invented in its place.'}
        recovery={error.digest ? `Error digest ${error.digest}. No write was sent.` : 'No write was sent.'}
        action={
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        }
      />
    </AppShell>
  )
}
