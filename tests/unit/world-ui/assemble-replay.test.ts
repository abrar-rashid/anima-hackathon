// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assembleReplayComparison } from '@/app/api/world/assemble-replay'

describe('assembleReplayComparison', () => {
  it('computes divergent v3 and v4 series from the same fixture trace', () => {
    const comparison = assembleReplayComparison()
    expect(comparison.left.heading).toBe('Protocol v3')
    expect(comparison.right.heading).toBe('Protocol v4')
    expect(comparison.left.snapshots.length).toBeGreaterThan(1)
    expect(comparison.right.snapshots.length).toBeGreaterThan(1)

    const v3 = comparison.left.snapshots[comparison.left.snapshots.length - 1]!
    const v4 = comparison.right.snapshots[comparison.right.snapshots.length - 1]!
    const v3Entity = v3.entities[0]!
    const v4Entity = v4.entities[0]!

    expect(v3.provenance.replay?.label).toBe('Recorded simulator replay')
    expect(v4.provenance.world).toBe(v3.provenance.world)
    expect(v3.provenance.denominator.cases).toBe(1)
    expect(v4.provenance.denominator.cases).toBe(1)
    expect(v4Entity.neglectMinutes).toBeLessThan(v3Entity.neglectMinutes)
    expect(v4Entity.exceptionCount).toBeLessThan(v3Entity.exceptionCount)
    expect(v3.events.some((event) => event.kind === 'TransferTimedOut')).toBe(true)
    expect(v4.events.some((event) => event.kind === 'TransferTimedOut')).toBe(false)
  })

  it('does not hard-code the protocol outcome numbers into the assembler', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/api/world/assemble-replay.ts'), 'utf8')
    expect(source).not.toMatch(/\b240\b/)
    expect(source).not.toMatch(/\b25\b/)
    expect(source).not.toContain('8 exceptions')
  })
})
