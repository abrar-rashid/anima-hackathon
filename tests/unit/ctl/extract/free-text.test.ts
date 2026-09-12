import { describe, expect, it } from 'vitest'
import hospitalView from '../../../fixtures/live/v-hospital.json'
import gpView from '../../../fixtures/live/gpview.json'
import diagnosticsView from '../../../fixtures/live/v-diagnostics.json'
import type { SimResource, Site } from '@/ctl/contracts'
import { normaliseResource } from '@/ctl/normalise/resources'
import { collectFreeText } from '@/ctl/extract/free-text'

function load(view: { resources?: unknown[] }, site: Site): SimResource[] {
  return (view.resources ?? [])
    .map((raw) => normaliseResource(raw, site))
    .filter((resource): resource is SimResource => resource !== null)
}

const hospital = load(hospitalView, 'hospital')
const gp = load(gpView, 'gp')
const diagnostics = load(diagnosticsView, 'diagnostics')

describe('collectFreeText against captured payloads', () => {
  it('reads discharge-summary sections and cites the exact field each came from', () => {
    const summary = hospital.find((r) => r.id === 'discharge-summary-example')!
    const spans = collectFreeText([summary])

    expect(spans.map((span) => span.field).sort()).toEqual([
      'data.sections.course',
      'data.sections.diagnoses',
      'data.sections.followUp',
      'data.sections.gpActions',
      'data.sections.medicationChanges',
      'data.sections.reason',
      'data.sections.results',
    ])
    for (const span of spans) {
      expect(span.resourceId).toBe('discharge-summary-example')
      expect(span.version).toBe(1)
      expect(span.site).toBe('hospital')
      expect(span.patientId).toBe('SIM-000001')
      expect(span.anchorTime).toBe(1789200000000)
    }
  })

  it('carries the source priority verbatim without interpreting it', () => {
    const document = hospital.find((r) => r.id === 'r-1')!
    const [span] = collectFreeText([document])

    expect(span?.field).toBe('data.text')
    expect(span?.priority).toBe('urgent')
  })

  it('reads report text from the diagnostics view', () => {
    const reports = diagnostics.filter((r) => r.kind === 'report')
    const spans = collectFreeText(reports)

    expect(spans.length).toBeGreaterThan(0)
    expect(spans.every((span) => span.field === 'data.text')).toBe(true)
  })

  it('reads consultation narrative and its sections, without duplicating shared text', () => {
    const encounter = gp.find((r) => r.kind === 'encounter' && 'sections' in r.data)!
    const spans = collectFreeText([encounter])
    const texts = spans.map((span) => span.text)

    expect(new Set(texts).size).toBe(texts.length)
    expect(spans.some((span) => span.field === 'data.text')).toBe(true)
    expect(spans.some((span) => span.field.startsWith('data.sections.'))).toBe(true)
  })

  it('reads no structured clinical value: only narrative fields are collected', () => {
    const spans = collectFreeText([...hospital, ...gp, ...diagnostics])
    const fields = new Set(spans.map((span) => span.field))

    for (const forbidden of ['data.value', 'data.analytes', 'data.problems', 'data.medications']) {
      expect(fields.has(forbidden)).toBe(false)
    }
  })

  it('every span text is present verbatim in its source resource', () => {
    const byId = new Map([...hospital, ...gp, ...diagnostics].map((r) => [r.id, r]))
    for (const span of collectFreeText([...hospital, ...gp, ...diagnostics])) {
      const source = byId.get(span.resourceId)!
      expect(JSON.stringify(source.data)).toContain(JSON.stringify(span.text).slice(1, -1))
    }
  })

  it('skips resources with no patient, since a task with no patient cannot be cited', () => {
    const orphan: SimResource = {
      id: 'r-x',
      kind: 'document',
      title: 'Unattributed letter',
      status: 'available',
      version: 1,
      visibleTo: ['hospital'],
      site: 'hospital',
      data: { text: 'Please arrange a follow-up appointment for this patient.' },
      provenance: { changes: [] },
    }

    expect(collectFreeText([orphan])).toEqual([])
  })

  it('skips kinds that hold no clinician narrative', () => {
    const beds = hospital.filter((r) => r.kind === 'bed' || r.kind === 'theatre-slot')
    expect(collectFreeText(beds)).toEqual([])
  })
})
