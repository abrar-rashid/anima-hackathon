import type { ChangeEvent, ReactElement } from 'react'
import { Segmented } from '@/design'
import type { Finding, SiteDescriptor } from '@/ctl/contracts'
import type { WorklistFilters as FilterState } from './types'
import styles from './worklist-filters.module.css'

const BREACH_OPTIONS = [
  { value: 'all', label: 'All breach states' },
  { value: 'breached', label: 'Breached' },
  { value: 'due-soon', label: 'Due soon' },
  { value: 'on-time', label: 'On time' },
  { value: 'no-deadline', label: 'No deadline' },
]

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort()
}

export function WorklistFilters({
  findings,
  sites,
  value,
  onChange,
}: {
  findings: Finding[]
  sites: SiteDescriptor[]
  value: FilterState
  onChange: (next: FilterState) => void
}): ReactElement {
  const siteIds = unique(findings.map((item) => item.site))
  const priorities = unique(findings.map((item) => item.priority))
  const detectors = unique(findings.map((item) => item.detector))
  const hasUnsuppliedPriority = findings.some((item) => !item.priority)

  function set<K extends keyof FilterState>(key: K, next: FilterState[K]): void {
    onChange({ ...value, [key]: next })
  }

  function onSelect(key: keyof FilterState) {
    return (event: ChangeEvent<HTMLSelectElement>) => set(key, event.target.value)
  }

  return (
    <div className={styles.row}>
      <label className={styles.field}>
        <span className={styles.label}>Site</span>
        <select className={styles.select} value={value.site} onChange={onSelect('site')}>
          <option value="all">All sites in this scan</option>
          {siteIds.map((id) => (
            <option key={id} value={id}>
              {sites.find((site) => site.id === id)?.name ?? id}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Source-supplied priority</span>
        <select className={styles.select} value={value.priority} onChange={onSelect('priority')}>
          <option value="all">All priorities</option>
          {priorities.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
          {hasUnsuppliedPriority ? (
            <option value="unsupplied">not supplied by source</option>
          ) : null}
        </select>
      </label>

      <div className={styles.field}>
        <span className={styles.label}>Breach state</span>
        <Segmented
          label="Breach state"
          options={BREACH_OPTIONS}
          value={value.breach}
          onChange={(next) => set('breach', next)}
        />
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Detector</span>
        <select className={styles.select} value={value.detector} onChange={onSelect('detector')}>
          <option value="all">All detectors</option>
          {detectors.map((detector) => (
            <option key={detector} value={detector}>
              {detector}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
