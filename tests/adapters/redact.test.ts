import { describe, expect, it } from 'vitest'
import { redact } from '@/adapters/anima/redact'

describe('redact', () => {
  it('redaction removes bearer tokens and free text', () => {
    const input = {
      title: 'Review CRP',
      text: 'Patient reports chest pain',
      body: 'Please telephone the surgery',
      clinicalDetails: 'Raised inflammatory markers',
      detail: 'request arrived from reception',
      authorization: 'Bearer dummy-test-key-not-real',
      nested: {
        text: 'inner clinical note',
        safe: 'visible-to-gp',
      },
      sections: [
        { id: 's1', heading: 'Assessment', text: 'Tender abdomen' },
        { id: 's2', heading: 'Plan', text: 'Repeat bloods' },
      ],
    }

    const redacted = redact(input) as typeof input

    expect(redacted.title).toBe('Review CRP')
    expect(redacted.text).toBe('[redacted]')
    expect(redacted.body).toBe('[redacted]')
    expect(redacted.clinicalDetails).toBe('[redacted]')
    expect(redacted.detail).toBe('[redacted]')
    expect(redacted.authorization).toBe('[redacted]')
    expect(redacted.nested.text).toBe('[redacted]')
    expect(redacted.nested.safe).toBe('visible-to-gp')
    expect(redacted.sections[0]?.id).toBe('[redacted]')
    expect(redacted.sections[0]?.heading).toBe('[redacted]')
    expect(redacted.sections[0]?.text).toBe('[redacted]')
    expect(redacted.sections[1]?.text).toBe('[redacted]')
    expect(JSON.stringify(redacted)).not.toMatch(/Bearer\s+\S+/)
    expect(JSON.stringify(redacted)).not.toContain('dummy-test-key-not-real')
    expect(JSON.stringify(redacted)).not.toContain('chest pain')
  })
})
