'use client'

import { useMemo, useState, type ReactElement } from 'react'
import { Skeleton, Stack, Text } from '@/design'
import { PatientSearch } from './PatientSearch'
import { ScanNotice } from './ScanNotice'
import { WorklistFilters } from './WorklistFilters'
import { applyFilters, WorklistQueue } from './WorklistQueue'
import { WorklistHeader } from './WorklistHeader'
import { EMPTY_FILTERS, type WorklistFilters as FilterState, type WorklistSourced } from './types'
import styles from './worklist-view.module.css'

export function WorklistView({ initial }: { initial: WorklistSourced }): ReactElement {
  const [sourced, setSourced] = useState(initial)
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [busy, setBusy] = useState(false)

  async function retry(): Promise<void> {
    setBusy(true)
    try {
      const response = await fetch('/api/ctl/worklist', { cache: 'no-store' })
      const body = (await response.json()) as WorklistSourced
      setSourced(body)
    } catch (error) {
      setSourced({
        ...sourced,
        stale: sourced.data.window.scanned > 0 || sourced.data.findings.length > 0,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(
    () => applyFilters(sourced.data.findings, filters),
    [sourced.data.findings, filters],
  )
  const filteredDown = visible.length !== sourced.data.findings.length

  return (
    <Stack gap="xl">
      <WorklistHeader rates={sourced.data.rates} window={sourced.data.window} />
      <ScanNotice
        stale={sourced.stale}
        fetchedAt={sourced.fetchedAt}
        error={sourced.error}
        window={sourced.data.window}
        sites={sourced.data.sites}
        onRetry={() => void retry()}
        busy={busy}
      />
      {busy ? (
        <Skeleton label="Refreshing the worklist. The previous scan remains on screen until this returns." bars={3} />
      ) : null}
      <div className={styles.page}>
        <WorklistFilters
          findings={sourced.data.findings}
          sites={sourced.data.sites}
          value={filters}
          onChange={setFilters}
        />
        <PatientSearch now={sourced.data.window.now} />
        <section className={styles.queue} aria-labelledby="queue-heading">
          <Text as="p" size="meta" tone="muted">
            Queue · {visible.length} of {sourced.data.findings.length} findings
          </Text>
          <WorklistQueue
            findings={visible}
            patients={sourced.data.patients}
            sites={sourced.data.sites}
            window={sourced.data.window}
            emptyBecauseFilter={filteredDown && visible.length === 0}
          />
        </section>
      </div>
    </Stack>
  )
}
