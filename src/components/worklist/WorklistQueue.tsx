import type { ReactElement } from 'react'
import { EmptyState } from '@/design'
import type { Finding, SimPatient, SiteDescriptor } from '@/ctl/contracts'
import { formatScanWindow } from './format'
import type { WorklistFilters } from './types'
import { WorklistRow } from './WorklistRow'
import type { ScanWindow } from '@/ctl/contracts'

export function applyFilters(findings: Finding[], filters: WorklistFilters): Finding[] {
  return findings.filter((finding) => {
    if (filters.site !== 'all' && finding.site !== filters.site) return false
    if (filters.priority === 'unsupplied' && finding.priority) return false
    if (filters.priority !== 'all' && filters.priority !== 'unsupplied' && finding.priority !== filters.priority) {
      return false
    }
    if (filters.breach !== 'all' && finding.breach !== filters.breach) return false
    if (filters.detector !== 'all' && finding.detector !== filters.detector) return false
    return true
  })
}

export function WorklistQueue({
  findings,
  patients,
  sites,
  window,
  emptyBecauseFilter,
}: {
  findings: Finding[]
  patients: Record<string, SimPatient>
  sites: SiteDescriptor[]
  window: ScanWindow
  emptyBecauseFilter: boolean
}): ReactElement {
  if (findings.length === 0) {
    return (
      <EmptyState
        title={emptyBecauseFilter ? 'No rows match these filters' : 'No unclosed work found in the scanned window'}
        body={
          emptyBecauseFilter
            ? 'The scan still stands. Clear a filter to see the rest of the queue.'
            : `No unclosed work found in the scanned window (${formatScanWindow(window)}).`
        }
      />
    )
  }

  return (
    <div>
      {findings.map((finding) => (
        <WorklistRow
          key={finding.id}
          finding={finding}
          patient={finding.patientId ? patients[finding.patientId] : undefined}
          siteName={sites.find((site) => site.id === finding.site)?.name}
          now={window.now}
        />
      ))}
    </div>
  )
}
