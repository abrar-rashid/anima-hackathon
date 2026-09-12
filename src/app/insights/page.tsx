import type { ReactElement } from 'react'
import type { Metadata } from 'next'
import { assembleInsights } from '@/app/api/ctl/assemble'
import { InsightsView } from '@/components/insights'
import { AppShell } from '@/components/worklist'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Operational latency · Close The Loop',
  description:
    'Step latency and loop breakage computed from provenance in a synthetic NHS neighbourhood.',
}

export default async function InsightsPage(): Promise<ReactElement> {
  try {
    const initial = await assembleInsights()
    return (
      <AppShell current="insights">
        <InsightsView initial={initial} />
      </AppShell>
    )
  } catch (error) {
    return (
      <AppShell current="insights">
        <InsightsView
          initial={{
            data: {
              report: {
                steps: [],
                breakage: [],
                window: { scanned: 0, total: 0, sites: [], now: 0, failedSites: [] },
              },
              sites: [],
            },
            fetchedAt: Date.now(),
            stale: false,
            error: error instanceof Error ? error.message : String(error),
          }}
        />
      </AppShell>
    )
  }
}
