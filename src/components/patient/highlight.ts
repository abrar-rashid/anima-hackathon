/**
 * Splits free text into plain and highlighted segments for rendering.
 *
 * Pure. A quote that cannot be found verbatim in the text is simply dropped —
 * per the spec, an unmatched candidate renders without a highlight rather than
 * guessing a location.
 */

export interface HighlightSegment {
  text: string
  /** Index into the caller's task list, or null for unhighlighted text. */
  taskIndex: number | null
}

interface QuoteRef {
  quote: string
  taskIndex: number
}

export function highlightQuotes(text: string, quotes: QuoteRef[]): HighlightSegment[] {
  interface Match {
    start: number
    end: number
    taskIndex: number
  }

  const matches: Match[] = []
  for (const { quote, taskIndex } of quotes) {
    if (quote.length === 0) continue
    const start = text.indexOf(quote)
    if (start === -1) continue
    matches.push({ start, end: start + quote.length, taskIndex })
  }
  matches.sort((a, b) => a.start - b.start)

  const nonOverlapping: Match[] = []
  let cursor = -1
  for (const match of matches) {
    if (match.start >= cursor) {
      nonOverlapping.push(match)
      cursor = match.end
    }
  }

  const segments: HighlightSegment[] = []
  let pos = 0
  for (const match of nonOverlapping) {
    if (match.start > pos) segments.push({ text: text.slice(pos, match.start), taskIndex: null })
    segments.push({ text: text.slice(match.start, match.end), taskIndex: match.taskIndex })
    pos = match.end
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), taskIndex: null })
  return segments
}
