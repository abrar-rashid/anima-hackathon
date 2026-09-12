// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DESIGN_ROOT = join(process.cwd(), 'src/design')
const CDN = /fonts\.googleapis\.com|fonts\.gstatic\.com/

const TEXT = /\.(css|ts|tsx|txt|md)$/

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return walk(path)
    return TEXT.test(path) ? [path] : []
  })
}

describe('self-hosted design fonts', () => {
  it('does not request Google Fonts from any design-system file', () => {
    const hits = walk(DESIGN_ROOT).filter((path) => CDN.test(readFileSync(path, 'utf8')))
    expect(hits).toEqual([])
  })

  it('declares local Atkinson and Red Hat faces with swap', () => {
    const css = readFileSync(join(DESIGN_ROOT, 'tokens.css'), 'utf8')
    expect(css).toMatch(/@font-face/)
    expect(css).toMatch(/atkinson-hyperlegible-latin-400-normal\.woff2/)
    expect(css).toMatch(/red-hat-mono-latin-500-normal\.woff2/)
    expect(css).toMatch(/font-display:\s*swap/)
    expect(css).toMatch(/--ds-font-ui:\s*'Atkinson Hyperlegible', 'Segoe UI', sans-serif/)
    expect(css).toMatch(/--ds-font-data:\s*'Red Hat Mono', ui-monospace, monospace/)
  })
})
