import type { ReactElement } from 'react'
import { EmptyState, Heading, Stack, StateBadge, Surface, Text } from '@/design'
import type { ExtractedTask, SimResource } from '@/ctl/contracts'
import { NOT_SUPPLIED } from '@/ctl/contracts'
import { HighlightedText } from './HighlightedText'
import { absent, formatSimTime } from './format'
import type { ExtractionSummary } from './types'
import styles from './free-text-evidence.module.css'

const SECTION_LABELS: Record<string, string> = {
  reason: 'Reason for admission',
  course: 'Course',
  results: 'Results',
  followUp: 'Follow-up',
  gpActions: 'Actions for GP',
  diagnoses: 'Diagnoses',
  medicationChanges: 'Medication changes',
}

function candidatesFor(
  resourceId: string,
  sectionKey: string,
  tasks: ExtractedTask[],
  anchorPrefix: string,
): { task: ExtractedTask; anchorId: string }[] {
  return tasks
    .map((task, i) => ({ task, index: i }))
    .filter(
      ({ task }) =>
        task.citation.resourceId === resourceId && task.citation.field === `data.sections.${sectionKey}`,
    )
    .map(({ task, index }) => ({ task, anchorId: `${anchorPrefix}-${index}` }))
}

function DocumentPanel({
  document,
  tasks,
}: {
  document: SimResource
  tasks: ExtractedTask[]
}): ReactElement {
  const sections = (document.data.sections ?? {}) as Record<string, unknown>
  const sentBy = typeof document.data.sentBy === 'string' ? document.data.sentBy : undefined
  const stage = typeof document.data.stage === 'string' ? document.data.stage : undefined
  const sentAt = typeof document.data.sentAt === 'number' ? document.data.sentAt : undefined
  const sectionEntries = Object.entries(sections).filter(([, v]) => typeof v === 'string' && v.length > 0)

  return (
    <Surface as="article" elevation="flat" padding="md">
      <Stack gap="sm">
        <div className={styles.docHead}>
          <Heading as="h3" size="lead">
            {document.title}
          </Heading>
          {stage ? <StateBadge tone="idle" label={stage} /> : null}
        </div>
        <Text as="p" size="meta" tone="muted">
          Sent by {sentBy ?? absent('sender')} · {sentAt ? formatSimTime(sentAt) : absent('sent time')}
        </Text>
        {sectionEntries.length === 0 ? (
          <Text as="p" tone="muted">
            {absent('free-text sections')}
          </Text>
        ) : (
          sectionEntries.map(([key, value]) => {
            const anchorPrefix = `${document.id}-${key}`
            const candidates = candidatesFor(document.id, key, tasks, anchorPrefix)
            return (
              <Stack key={key} gap="2xs">
                <Text as="p" size="meta" tone="muted">
                  {SECTION_LABELS[key] ?? key}
                </Text>
                <HighlightedText text={value as string} candidates={candidates} />
              </Stack>
            )
          })
        )}
      </Stack>
    </Surface>
  )
}

/**
 * Free-text handover letters, verbatim, with `ExtractedTask` quotes
 * highlighted in place. `documents` are the actual `discharge-summary` /
 * `document` resources read for this patient; nothing here is summarised or
 * paraphrased.
 */
export function FreeTextEvidence({
  documents,
  extraction,
}: {
  documents: SimResource[]
  extraction: ExtractionSummary
}): ReactElement {
  return (
    <Surface as="section" elevation="raised" padding="lg" labelledBy="free-text-heading">
      <Stack gap="md">
        <Heading as="h2" size="title" id="free-text-heading">
          Correspondence and free text
        </Heading>
        <Text as="p" size="meta" tone="muted">
          {extraction.resourcesRead} record{extraction.resourcesRead === 1 ? '' : 's'} read ·{' '}
          {extraction.spansRead} span{extraction.spansRead === 1 ? '' : 's'} of free text ·{' '}
          {extraction.tasks.length} candidate task{extraction.tasks.length === 1 ? '' : 's'} extracted
        </Text>
        {extraction.reason ? (
          <Text as="p" size="meta" tone="awaiting">
            {extraction.reason}
          </Text>
        ) : null}

        {documents.length === 0 ? (
          <EmptyState
            title="No correspondence"
            body="No discharge summary or document record was read for this patient."
          />
        ) : (
          <Stack gap="md">
            {documents.map((document) => (
              <DocumentPanel key={document.id} document={document} tasks={extraction.tasks} />
            ))}
          </Stack>
        )}

        {extraction.tasks.length > 0 ? (
          <Stack gap="sm" as="ul">
            <Text as="p" size="meta" tone="muted">
              Candidate tasks from free text
            </Text>
            {extraction.tasks.map((task, i) => {
              const anchorId = `${task.citation.resourceId}-${task.citation.field?.split('.').pop() ?? 'span'}-${i}`
              return (
                <li key={anchorId} id={anchorId} className={styles.candidateRow}>
                  <Text as="p" size="body">
                    {task.summary} · <span className={styles.tag}>{task.tag}</span>
                  </Text>
                  <Text as="p" size="meta" tone="muted">
                    Priority: {task.priority === NOT_SUPPLIED ? absent('priority') : task.priority} · Due:{' '}
                    {task.dueAt ? formatSimTime(task.dueAt) : absent('due date')}
                  </Text>
                </li>
              )
            })}
          </Stack>
        ) : null}
      </Stack>
    </Surface>
  )
}
