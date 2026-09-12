'use client'

import { useState, type ReactElement } from 'react'
import { Skeleton, Stack, Tabs } from '@/design'
import { EffectuatorDrawer } from './EffectuatorDrawer'
import { FreeTextEvidence } from './FreeTextEvidence'
import { LoopTimeline } from './LoopTimeline'
import { OpenWork } from './OpenWork'
import { PatientHeader } from './PatientHeader'
import { PatientScanNotice } from './PatientScanNotice'
import type { PatientLoopSourced } from './types'

/**
 * The patient loop page body.
 *
 * Density discipline: the header, the timeline and open work render by
 * default. Everything else — free text, the proposed action's exact payload,
 * raw provenance minutiae — sits behind a tab or an expander, so the default
 * view stays readable at volume.
 */
export function PatientLoopView({ initial }: { initial: PatientLoopSourced }): ReactElement {
  const [sourced, setSourced] = useState(initial)
  const [busy, setBusy] = useState(false)
  const { data } = sourced

  async function retry(): Promise<void> {
    setBusy(true)
    try {
      const response = await fetch(`/api/ctl/patient/${data.patientId}`, { cache: 'no-store' })
      const body = (await response.json()) as PatientLoopSourced
      setSourced(body)
    } catch (error) {
      setSourced({
        ...sourced,
        stale: data.resources.length > 0,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap="xl">
      <PatientScanNotice
        stale={sourced.stale}
        fetchedAt={sourced.fetchedAt}
        error={sourced.error}
        window={data.window}
        sites={data.sites}
        onRetry={() => void retry()}
        busy={busy}
      />
      {busy ? (
        <Skeleton label="Re-reading this patient. The previous read stays on screen until this returns." bars={3} />
      ) : null}

      <PatientHeader
        patientId={data.patientId}
        patient={data.patient}
        now={data.now}
        lookupError={data.patientLookupError}
      />

      <LoopTimeline timeline={data.timeline} now={data.now} resources={data.resources} sites={data.sites} />

      <OpenWork
        tasks={data.tasks}
        findings={data.findings}
        resources={data.resources}
        sites={data.sites}
        now={data.now}
      />

      <Tabs
        label="More detail"
        tabs={[
          {
            id: 'correspondence',
            label: 'Correspondence',
            content: <FreeTextEvidence documents={data.documents} extraction={data.extraction} />,
          },
          {
            id: 'propose',
            label: 'Propose action',
            content: <EffectuatorDrawer outcome={data.proposal} resources={data.resources} sites={data.sites} />,
          },
        ]}
      />
    </Stack>
  )
}
