// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WorklistView } from '@/components/worklist'
import { FINDING_TASK, FORBIDDEN_LEGACY_STRINGS, PATIENT_AMIRA, SITES_FIXTURE, makeWorklist } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('worklist honesty', () => {
  it('renders only the patient name, owner and site label present in the fixture', () => {
    const { container } = render(<WorklistView initial={makeWorklist()} />)
    const text = container.textContent ?? ''

    // Real values from the fixture must appear.
    expect(text).toContain(PATIENT_AMIRA.name)
    expect(text).toContain(FINDING_TASK.summary)
    expect(text).toContain(FINDING_TASK.owner)
    expect(text).toContain(SITES_FIXTURE[0]?.name)

    // No value from the old hardcoded single-case build may leak back in.
    for (const banned of FORBIDDEN_LEGACY_STRINGS) {
      expect(text).not.toContain(banned)
    }
  })

  it('shows an explicit absence rather than a fabricated name when a patient record cannot be resolved', () => {
    const worklist = makeWorklist({
      findings: [{ ...FINDING_TASK, id: 'f-2', patientId: 'SIM-999999' }],
      patients: {},
    })
    const { container } = render(<WorklistView initial={worklist} />)
    const text = container.textContent ?? ''

    expect(text).toContain('SIM-999999')
    expect(text).toContain('not-supplied-by-source')
    expect(text).not.toContain(PATIENT_AMIRA.name)
  })

  it('shows an explicit absence rather than a fabricated owner or priority when the source omits them', () => {
    const worklist = makeWorklist({
      findings: [
        {
          ...FINDING_TASK,
          id: 'f-3',
          owner: undefined,
          priority: undefined,
        },
      ],
    })
    const { container } = render(<WorklistView initial={worklist} />)
    const text = container.textContent ?? ''

    expect(text).toContain('not-supplied-by-source')
    for (const banned of FORBIDDEN_LEGACY_STRINGS) {
      expect(text).not.toContain(banned)
    }
  })

  it('links a finding with a patient to /patient/{patientId} and never invents an href for one without', () => {
    const worklist = makeWorklist({
      findings: [FINDING_TASK, { ...FINDING_TASK, id: 'f-4', patientId: undefined }],
    })
    const { container } = render(<WorklistView initial={worklist} />)
    const links = [...container.querySelectorAll('a[href^="/patient/"]')]
    expect(links.some((link) => link.getAttribute('href') === `/patient/${PATIENT_AMIRA.id}`)).toBe(true)

    const disabledActions = [...container.querySelectorAll('[aria-disabled="true"]')]
    expect(disabledActions.length).toBeGreaterThan(0)
  })
})
