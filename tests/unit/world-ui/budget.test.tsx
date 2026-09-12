// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WORLD_PERF_BUDGET } from '@/components/world/budget'
import { WorldView } from '@/components/world/WorldView'
import { snapshot } from './fixtures'

afterEach(() => {
  cleanup()
})

describe('world performance budget', () => {
  it('renders the typical atlas under the SVG node and jsdom time budgets', () => {
    const started = performance.now()
    render(<WorldView snapshot={snapshot()} />)
    const elapsed = performance.now() - started
    const svgNodes = document.querySelector('[data-world-atlas]')?.querySelectorAll('*').length ?? 0
    expect(svgNodes).toBeLessThan(WORLD_PERF_BUDGET.maxSvgNodes)
    expect(elapsed).toBeLessThan(WORLD_PERF_BUDGET.maxJsdomRenderMs)
  })

  it('does not run a JavaScript animation loop', () => {
    const worldDir = join(process.cwd(), 'src/components/world')
    const files = [
      'WorldCanvas.tsx',
      'WorldView.tsx',
      'WorldComparison.tsx',
      'ThreadMark.tsx',
      'EntityMark.tsx',
    ]
    for (const file of files) {
      const source = readFileSync(join(worldDir, file), 'utf8')
      expect(source).not.toMatch(/requestAnimationFrame/)
      expect(source).not.toMatch(/setInterval/)
    }
    expect(WORLD_PERF_BUDGET.jsFrameCostWhenPausedMs).toBe(0)
  })
})
