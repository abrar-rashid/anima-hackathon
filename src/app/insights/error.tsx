'use client'

import type { ReactElement } from 'react'
import { Button, ErrorState } from '@/design'
import { AppShell } from '@/components/worklist'

export default function InsightsError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}): ReactElement {
  return (
    <AppShell current="insights">
      <ErrorState
        title="Insights could not be loaded"
        body={error.message}
        recovery="The worklist and neighbourhood remain available. No write was sent."
        action={
          <Button variant="secondary" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </AppShell>
  )
}
