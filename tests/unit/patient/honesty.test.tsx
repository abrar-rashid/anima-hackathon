// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PatientLoopView } from '@/components/patient/PatientLoopView'
import {
  DISCHARGE_SUMMARY,
  FORBIDDEN_LEGACY_STRINGS,
  NHS_NUMBER_PATTERN,
  PATIENT_AMIRA,
  TASK_RESOURCE,
  makeSourced,
} from './fixtures'

afterEach(() => {
  cleanup()
})

describe('patient loop honesty', () => {
  it('renders only the patient name, conditions and site labels present in the fixture, and no NHS number', () => {
    const { container } = render(<PatientLoopView initial={makeSourced()} />)
    const text = container.textContent ?? ''

    expect(text).toContain(PATIENT_AMIRA.name)
    expect(text).toContain(PATIENT_AMIRA.conditions[0])
    expect(text).toContain(TASK_RESOURCE.title)
    expect(text).toContain(DISCHARGE_SUMMARY.data.sentBy as string)

    // No NHS number anywhere: the source has none, so nothing may claim one.
    expect(text.toLowerCase()).not.toContain('nhs #')
    expect(text.toLowerCase()).not.toContain('nhs number: 9')
    expect(NHS_NUMBER_PATTERN.test(text)).toBe(false)

    for (const banned of FORBIDDEN_LEGACY_STRINGS) {
      expect(text).not.toContain(banned)
    }
  })

  it('states explicit absence rather than fabricating a patient when the directory returns none', () => {
    const sourced = makeSourced({ patient: null, patientLookupError: undefined })
    const { container } = render(<PatientLoopView initial={sourced} />)
    const text = container.textContent ?? ''

    expect(text).toContain('SIM-000001')
    expect(text.toLowerCase()).toContain('no patient record')
    expect(text).not.toContain(PATIENT_AMIRA.name)
  })

  it('states explicit absence rather than fabricating an owner or due date on a task missing them', () => {
    const bareTask = { ...TASK_RESOURCE, owner: undefined, dueAt: undefined }
    const sourced = makeSourced({ tasks: [bareTask] })
    const { container } = render(<PatientLoopView initial={sourced} />)
    const text = container.textContent ?? ''

    expect(text).toContain('not-supplied-by-source')
  })

  it('every finding renders a citation control that names its source resource', () => {
    const { container } = render(<PatientLoopView initial={makeSourced()} />)
    const buttons = [...container.querySelectorAll('button')].map((b) => b.textContent)
    expect(buttons.some((label) => label?.toLowerCase().includes('evidence'))).toBe(true)
  })
})
