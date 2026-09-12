// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = [
  join(process.cwd(), 'src/components/world'),
  join(process.cwd(), 'src/app/world'),
]

const FORBIDDEN = [
  'adapters/anima',
  'anima-write',
  'AnimaWritePort',
  'execution-service',
  'ANIMA_SIM_API_KEY',
  'approve',
]

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, acc)
    else acc.push(path)
  }
  return acc
}

describe('world UI import boundary', () => {
  it('does not import adapters, write ports, or write services', () => {
    const files = ROOTS.flatMap((root) => walk(root)).filter((path) => /\.(ts|tsx|css)$/.test(path))
    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const token of FORBIDDEN) {
        if (token === 'approve') {
          expect(source, file).not.toMatch(/Approve covenant|approve\(/i)
          continue
        }
        expect(source, file).not.toContain(token)
      }
    }
  })
})
