import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../src/world')

const OWNED = ['projection.ts', 'derive.ts', 'replay.ts']

describe('world projection hygiene', () => {
  it('does not import adapters, write ports, fetch, or wall-clock time', () => {
    for (const file of OWNED) {
      const source = readFileSync(join(dir, file), 'utf8')
      expect(source, file).not.toMatch(/@\/adapters/)
      expect(source, file).not.toMatch(/AnimaWritePort|AnimaReadPort/)
      expect(source, file).not.toMatch(/\bfetch\s*\(/)
      expect(source, file).not.toMatch(/Date\.now\s*\(/)
      expect(source, file).not.toMatch(/Math\.random\s*\(/)
      expect(source, file).not.toMatch(/ANIMA_SIM_API_KEY/)
    }
  })
})
