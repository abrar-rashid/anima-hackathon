// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { neglectBand, rotPixelCount, snapshotAtOrBefore } from '@/components/world/format'
import { barrenSnapshot, snapshot } from './fixtures'

describe('world format helpers', () => {
  it('maps neglect minutes onto bands without using protocol constants', () => {
    expect(neglectBand(0)).toBe('fresh')
    expect(neglectBand(12)).toBe('dust')
    expect(neglectBand(45)).toBe('crack')
    expect(neglectBand(777)).toBe('rot')
    expect(rotPixelCount(0)).toBe(0)
    expect(rotPixelCount(777)).toBe(18)
  })

  it('picks the latest snapshot at or before the scrubber time', () => {
    const early = snapshot({ now: 10 })
    const late = snapshot({ now: 30 })
    expect(snapshotAtOrBefore([early, late], 5)?.now).toBe(10)
    expect(snapshotAtOrBefore([early, late], 30)?.now).toBe(30)
    expect(snapshotAtOrBefore([early, late], 20)?.now).toBe(10)
    expect(snapshotAtOrBefore([], 20)).toBeNull()
    expect(snapshotAtOrBefore([barrenSnapshot()], 1)?.provenance.world).toBe('team-barren')
  })
})
