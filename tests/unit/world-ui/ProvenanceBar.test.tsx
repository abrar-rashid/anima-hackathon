// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProvenanceBar } from '@/components/world/ProvenanceBar'

afterEach(() => {
  cleanup()
})

describe('ProvenanceBar', () => {
  it('always shows world id and the honest denominator', () => {
    render(
      <ProvenanceBar
        provenance={{ world: 'team-x', replay: null, denominator: { cases: 4, events: 19 } }}
      />,
    )
    expect(screen.getByText('World team-x')).toBeTruthy()
    expect(screen.getByText('Built from 4 cases and 19 events')).toBeTruthy()
    expect(screen.queryByText('Recorded simulator replay')).toBeNull()
  })

  it('prints the verbatim replay label with its capture time', () => {
    render(
      <ProvenanceBar
        provenance={{
          world: 'team-x',
          replay: { label: 'Recorded simulator replay', capturedAt: '2020-01-01T00:00:00.000Z' },
          denominator: { cases: 1, events: 1 },
        }}
      />,
    )
    expect(screen.getByText('Recorded simulator replay · captured 2020-01-01T00:00:00.000Z')).toBeTruthy()
  })
})
