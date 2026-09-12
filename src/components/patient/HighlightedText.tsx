import type { ReactElement } from 'react'
import type { ExtractedTask } from '@/ctl/contracts'
import { highlightQuotes } from './highlight'
import styles from './free-text-evidence.module.css'

/**
 * Renders one section of free text with matching extracted-task quotes
 * highlighted in place. A candidate whose quote cannot be found verbatim in
 * `text` is simply not highlighted here — it still appears in the task list
 * below, unlinked, rather than being placed at a guessed location.
 */
export function HighlightedText({
  text,
  candidates,
}: {
  text: string
  candidates: { task: ExtractedTask; anchorId: string }[]
}): ReactElement {
  const segments = highlightQuotes(
    text,
    candidates.map((c, i) => ({ quote: c.task.citation.quote, taskIndex: i })),
  )

  return (
    <p className={styles.freeText}>
      {segments.map((segment, i) =>
        segment.taskIndex === null ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <a key={i} className={styles.mark} href={`#${candidates[segment.taskIndex]?.anchorId}`}>
            {segment.text}
          </a>
        ),
      )}
    </p>
  )
}
