import type { ReactElement } from 'react'
import { EmptyState, Heading, Stack, StateBadge, Surface, Text } from '@/design'
import type { BreachState, Finding, SimResource, SiteDescriptor } from '@/ctl/contracts'
import { CitationDisclosure } from './CitationDisclosure'
import { absent, relativeToNow } from './format'
import { siteLabel } from './site-label'
import styles from './open-work.module.css'

const BREACH_TONE: Record<BreachState, 'blocked' | 'awaiting' | 'proven' | 'idle'> = {
  breached: 'blocked',
  'due-soon': 'awaiting',
  'on-time': 'proven',
  'no-deadline': 'idle',
}

const BREACH_LABEL: Record<BreachState, string> = {
  breached: 'Overdue',
  'due-soon': 'Due soon',
  'on-time': 'On time',
  'no-deadline': 'No deadline',
}

function TaskRow({
  task,
  now,
  resources,
  sites,
}: {
  task: SimResource
  now: number
  resources: SimResource[]
  sites: SiteDescriptor[]
}): ReactElement {
  return (
    <li className={styles.row}>
      <Stack gap="2xs">
        <Text as="p" size="body">
          <strong>{task.title}</strong> · {task.status}
          {task.priority ? ` · ${task.priority}` : ''}
        </Text>
        <Text as="p" size="meta" tone="muted">
          {siteLabel(task.site, sites)} · owner {task.owner ?? absent('owner')} · due{' '}
          {task.dueAt ? relativeToNow(task.dueAt, now) : absent('due date')}
        </Text>
        <CitationDisclosure
          citation={{ resourceId: task.id, version: task.version, site: task.site }}
          resources={resources}
          sites={sites}
          triggerLabel="View task record"
        />
      </Stack>
    </li>
  )
}

function FindingRow({
  finding,
  resources,
  sites,
}: {
  finding: Finding
  resources: SimResource[]
  sites: SiteDescriptor[]
}): ReactElement {
  return (
    <li className={styles.row}>
      <Stack gap="2xs">
        <div className={styles.findingHead}>
          <StateBadge tone={BREACH_TONE[finding.breach]} label={BREACH_LABEL[finding.breach]} />
          <Text as="p" size="body">
            {finding.summary}
          </Text>
        </div>
        <Text as="p" size="meta" tone="muted">
          {siteLabel(finding.site, sites)} · owner {finding.owner ?? absent('owner')}
          {finding.priority ? ` · ${finding.priority}` : ''}
        </Text>
        <div className={styles.citations}>
          {finding.citations.map((citation) => (
            <CitationDisclosure
              key={`${citation.resourceId}:${citation.version}`}
              citation={citation}
              resources={resources}
              sites={sites}
              triggerLabel="View evidence"
            />
          ))}
        </div>
      </Stack>
    </li>
  )
}

/**
 * Open and latent work: real `task` resources plus detector `Finding`s for
 * this patient. Both lists trace to a source record via `CitationDisclosure`;
 * neither is padded when short.
 */
export function OpenWork({
  tasks,
  findings,
  resources,
  sites,
  now,
}: {
  tasks: SimResource[]
  findings: Finding[]
  resources: SimResource[]
  sites: SiteDescriptor[]
  now: number
}): ReactElement {
  const empty = tasks.length === 0 && findings.length === 0

  return (
    <Surface as="section" elevation="raised" padding="lg" labelledBy="open-work-heading">
      <Stack gap="md">
        <Heading as="h2" size="title" id="open-work-heading">
          Open and latent work
        </Heading>
        {empty ? (
          <EmptyState
            title="Nothing open"
            body="No task records and no detector findings were read for this patient."
          />
        ) : (
          <div className={styles.columns}>
            <Stack gap="sm">
              <Text as="p" size="meta" tone="muted">
                Tasks · {tasks.length}
              </Text>
              {tasks.length === 0 ? (
                <Text as="p" tone="muted">
                  No task records for this patient.
                </Text>
              ) : (
                <ul className={styles.list}>
                  {tasks.map((task) => (
                    <TaskRow key={task.id} task={task} now={now} resources={resources} sites={sites} />
                  ))}
                </ul>
              )}
            </Stack>
            <Stack gap="sm">
              <Text as="p" size="meta" tone="muted">
                Findings · {findings.length}
              </Text>
              {findings.length === 0 ? (
                <Text as="p" tone="muted">
                  No unfinished work was detected for this patient.
                </Text>
              ) : (
                <ul className={styles.list}>
                  {findings.map((finding) => (
                    <FindingRow key={finding.id} finding={finding} resources={resources} sites={sites} />
                  ))}
                </ul>
              )}
            </Stack>
          </div>
        )}
      </Stack>
    </Surface>
  )
}
