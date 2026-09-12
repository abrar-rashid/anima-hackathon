import { expect, it } from 'vitest'
import { RETROSPECTIVE_MARKER, retrospectiveEvent } from '@/ctl/normalise/retrospective'
import { collectFreeText } from '@/ctl/extract/free-text'
import { buildTimelineEntries } from '@/components/patient/timeline'
import type { SimResource } from '@/ctl/contracts'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FreeTextEvidence } from '@/components/patient/FreeTextEvidence'

const meta = { patient_id: 'SIM-000006', investigation: 'ML-SEED-SIM-000006-CT-v1',
  stage: 'images_available', clinical_event_at: '2026-09-09T10:40:00+00:00',
  request_resource_id: 'request-1', evidence_kind: 'retrospective-narrative', pathway_state: 'completed',
  responsible_role: 'Radiographer' }
const resource: SimResource = { id: 'note-1', patientId: 'SIM-000006', kind: 'encounter',
  title: 'Synthetic scan event', status: 'saved', version: 1, site: 'gp', visibleTo: ['gp'],
  data: { text: RETROSPECTIVE_MARKER + '\n' + JSON.stringify(meta) + '\n\nRetrospective completed request.' },
  provenance: { changes: [], created: { time: 1789399200000, version: 1, source: 'team',
    action: 'save_consultation', actor: { name: 'team12', kind: 'team' } } } }

it('keeps explicit clinical time and server audit time as distinct timeline entries', () => {
  const entries = buildTimelineEntries([resource])
  expect(entries.map(e => e.time)).toEqual([Date.parse(meta.clinical_event_at), 1789399200000])
  expect(entries[0]!.action).toContain('Retrospective clinical event')
  expect(new Set(entries.map(e => e.key)).size).toBe(2)
})

it('does not turn explicitly completed retrospective requests into new open tasks', () => {
  expect(collectFreeText([resource])).toEqual([])
  const ordinary = { ...resource, data: { text: 'Please book a GP follow-up appointment.' } }
  expect(collectFreeText([ordinary])).toHaveLength(1)
})

it('rejects cross-patient metadata and timestamps without timezone', () => {
  expect(retrospectiveEvent({ ...resource, patientId: 'SIM-000007' })).toBeNull()
  expect(retrospectiveEvent({ ...resource, data: { text: (resource.data.text as string).replace('+00:00', '') } })).toBeNull()
})

it('renders consultation text even when no discharge-summary sections exist', () => {
  const markup = renderToStaticMarkup(createElement(FreeTextEvidence, {
    documents: [resource], extraction: { tasks: [], reason: null, spansRead: 0, resourcesRead: 0 },
  }))
  expect(markup).toContain('Retrospective completed request.')
  expect(markup).toContain('Retrospective synthetic event')
})
