import type { ReactElement } from 'react'
import { Skeleton, Text } from '@/design'
import { AppShell } from '@/components/worklist'

export default function InsightsLoading(): ReactElement {
  return (
    <AppShell current="insights">
      <Text as="p" size="lead">
        Operational latency
      </Text>
      <Skeleton
        label="Loading step latency. No figures have been returned yet."
        bars={4}
      />
    </AppShell>
  )
}
