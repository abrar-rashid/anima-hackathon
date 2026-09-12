import type { ReactElement } from 'react'
import type { Metadata } from 'next'
import { assembleWorklist } from '@/app/api/ctl/assemble'
import { AppShell, WorklistView } from '@/components/worklist'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Unclosed work · Close The Loop',
  description:
    'Every unfinished clinical loop the simulator will admit to, with the scan window that produced it. Synthetic data.',
}

export default async function WorklistPage(): Promise<ReactElement> {
  try {
    const initial = await assembleWorklist()
    return (
      <AppShell current="worklist">
        <WorklistView initial={initial} />
      </AppShell>
    )
  } catch (error) {
    return (
      <AppShell current="worklist">
        <WorklistView
          initial={{
            data: {
              findings: [],
              rates: [],
              window: { scanned: 0, total: 0, sites: [], now: 0, failedSites: [] },
              patients: {},
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
