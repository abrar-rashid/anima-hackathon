// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CONTRAST_PAIRS, contrastRatio } from '@/design/contrast'

describe('design contrast pairs', () => {
  it('meets the documented WCAG 2.2 minimum for every token pair', () => {
    const failures = CONTRAST_PAIRS.filter((pair) => {
      return contrastRatio(pair.foreground, pair.background) < pair.minimum
    })
    expect(failures).toEqual([])
  })

  it('records a ratio for ink on canvas above 13:1', () => {
    expect(contrastRatio('#14181F', '#DDE1E6')).toBeGreaterThan(13)
  })
})
