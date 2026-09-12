'use client'

import { useEffect, useMemo, useState, type FormEvent, type JSX } from 'react'
import type { SimPatient, Sourced } from '@/ctl/contracts'
import { formatBirthDate, initialsOf, siteLabel } from './format'
import { BloodWorkflowTimeline } from './BloodWorkflowTimeline'
import { workflowsForPatient, type BloodWorkflow } from './blood-workflow'
import type { WardlinePatient, WardlineTask } from './types'
import styles from './patient-directory.module.css'

const HERO_ID = 'SIM-000006'
const NONE_RECORDED = 'None recorded by the directory'

type PatientPage = {
  total: number
  items: SimPatient[]
  offset: number
}

function defaultSelectedId(patients: readonly WardlinePatient[]): string | null {
  if (patients.some((patient) => patient.id === HERO_ID)) return HERO_ID
  return patients[0]?.id ?? null
}

function matchesLocalQuery(patient: WardlinePatient, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [patient.name, patient.id, ...patient.conditions, ...patient.needs, ...patient.goals]
    .join('\u0000')
    .toLowerCase()
  return haystack.includes(needle)
}

/** Humanize camelCase / snake_case; leave simple keys (gp, hospital) as-is. */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!spaced.includes(' ')) return key
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase())
}

function localIdEntries(localIds: Record<string, string>): Array<[string, string]> {
  return Object.entries(localIds).filter(([key, value]) => key.length > 0 && value.length > 0)
}

function asWardlinePatient(patient: SimPatient, tasks: readonly WardlineTask[]): WardlinePatient {
  const conditions = Array.isArray(patient.conditions) ? patient.conditions : []
  const needs = Array.isArray(patient.needs) ? patient.needs : []
  const goals = Array.isArray(patient.goals) ? patient.goals : []
  const localIds =
    patient.localIds && typeof patient.localIds === 'object' && !Array.isArray(patient.localIds)
      ? Object.fromEntries(
          Object.entries(patient.localIds).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === 'string' && typeof entry[1] === 'string' && entry[1].length > 0,
          ),
        )
      : {}
  const linkedTaskCount = tasks.filter((task) => task.patientId === patient.id).length
  const richness = conditions.length + needs.length + goals.length + Object.keys(localIds).length
  return {
    id: patient.id,
    name: patient.name,
    conditions,
    needs,
    goals,
    localIds,
    ...(patient.birthDate ? { birthDate: patient.birthDate } : {}),
    ...(typeof patient.synthetic === 'boolean' ? { synthetic: patient.synthetic } : {}),
    linkedTaskCount,
    pinRank: null,
    operationalWeight: linkedTaskCount * 100 + richness,
  }
}

function isSimPatient(value: unknown): value is SimPatient {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && record.id.length > 0 && typeof record.name === 'string'
}

function ChipList({ values }: { values: readonly string[] }): JSX.Element {
  if (values.length === 0) {
    return <p className={styles.absent}>{NONE_RECORDED}</p>
  }
  return (
    <ul className={styles.chips}>
      {values.map((value, index) => (
        <li key={`${value}-${index}`} className={styles.chip}>
          {value}
        </li>
      ))}
    </ul>
  )
}

export function PatientDirectory(props: {
  patients: WardlinePatient[]
  tasks: WardlineTask[]
  profilesShown: number
  directoryTotal: number
  bloodWorkflows?: BloodWorkflow[]
}): JSX.Element {
  const { patients, tasks, directoryTotal, bloodWorkflows = [] } = props
  const [query, setQuery] = useState('')
  const [extras, setExtras] = useState<WardlinePatient[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(() => defaultSelectedId(patients))
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const catalog = useMemo(() => {
    const seen = new Set<string>()
    const merged: WardlinePatient[] = []
    for (const patient of patients) {
      if (seen.has(patient.id)) continue
      seen.add(patient.id)
      merged.push(patient)
    }
    for (const extra of extras) {
      if (seen.has(extra.id)) continue
      seen.add(extra.id)
      merged.push(extra)
    }
    return merged
  }, [patients, extras])

  const visible = useMemo(
    () => catalog.filter((patient) => matchesLocalQuery(patient, query)),
    [catalog, query],
  )

  useEffect(() => {
    setSelectedId((current) => {
      if (current && catalog.some((patient) => patient.id === current)) return current
      return defaultSelectedId(catalog)
    })
  }, [catalog])

  const selected = visible.find((patient) => patient.id === selectedId) ?? null
  const linkedTasks = selected ? tasks.filter((task) => task.patientId === selected.id) : []
  const selectedWorkflows = selected ? workflowsForPatient(bloodWorkflows, selected.id) : []
  const hasSeedTrack = selectedWorkflows.some((workflow) => workflow.origin === 'retrospective-seed')
  const hasMedTrack = selectedWorkflows.some((workflow) => workflow.origin === 'medlatency')
  const hasCt = selectedWorkflows.some((workflow) => /ct/i.test(workflow.panelName))
  const hasBlood = selectedWorkflows.some((workflow) => /fbc|blood|u&e|crp/i.test(workflow.panelName))
  const identifiers = selected ? localIdEntries(selected.localIds) : []
  const born = selected ? formatBirthDate(selected.birthDate) : null

  async function searchAnima(): Promise<void> {
    const trimmed = query.trim()
    if (!trimmed) return
    setSearching(true)
    setSearchError(null)
    try {
      const params = new URLSearchParams({ q: trimmed })
      const response = await fetch(`/api/ctl/patients?${params.toString()}`, { cache: 'no-store' })
      const body = (await response.json()) as Sourced<PatientPage>
      if (body.error) {
        setSearchError(body.error)
        return
      }
      if (!response.ok) {
        setSearchError(`Anima directory search failed (${response.status}).`)
        return
      }
      const items = body.data?.items
      if (!Array.isArray(items)) {
        setSearchError('Anima directory search returned an unreadable page.')
        return
      }
      const hits = items.filter(isSimPatient)
      setExtras((current) => {
        const known = new Set([...patients, ...current].map((patient) => patient.id))
        const additions = hits
          .filter((hit) => !known.has(hit.id))
          .map((hit) => asWardlinePatient(hit, tasks))
        return additions.length === 0 ? current : [...current, ...additions]
      })
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : String(error))
    } finally {
      setSearching(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void searchAnima()
  }

  return (
    <section className={styles.directory} aria-label="Synthetic patient directory">
      <form className={styles.searchRow} onSubmit={onSubmit} role="search">
        <label className={styles.searchField}>
          <span className={styles.srOnly}>Filter loaded synthetic profiles</span>
          <input
            className={styles.search}
            type="search"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, ID, condition…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button className={styles.searchAnima} type="submit" disabled={searching} aria-busy={searching}>
          {searching ? 'Searching…' : 'Search Anima'}
        </button>
      </form>

      <p className={styles.meta}>
        {visible.length} profiles shown · {directoryTotal.toLocaleString('en-GB')} in Anima
      </p>

      {searchError ? (
        <p className={styles.error} role="alert">
          {searchError}
        </p>
      ) : null}

      <div className={styles.split}>
        <div className={styles.listPane}>
          {visible.length === 0 ? (
            <div className={styles.empty}>
              <h2 className={styles.emptyTitle}>No matching patients</h2>
              <p className={styles.emptyBody}>
                Try a synthetic patient ID, name, condition, need, or goal.
              </p>
            </div>
          ) : (
            <ul className={styles.list} role="listbox" aria-label="Loaded synthetic profiles">
              {visible.map((patient) => {
                const selectedRow = patient.id === selectedId
                const n = patient.linkedTaskCount
                return (
                  <li key={patient.id}>
                    <button
                      type="button"
                      className={styles.row}
                      role="option"
                      aria-selected={selectedRow}
                      onClick={() => setSelectedId(patient.id)}
                    >
                      <span className={styles.avatar} aria-hidden="true">
                        {initialsOf(patient.name)}
                      </span>
                      <span className={styles.identity}>
                        <span className={styles.name}>{patient.name}</span>
                        <span className={styles.id}>{patient.id}</span>
                      </span>
                      <span className={styles.taskCount}>
                        {n === 1 ? '1 task' : `${n} tasks`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className={styles.profilePane}>
          {selected ? (
            <article className={styles.profile} aria-labelledby="wardline-profile-name">
              <p className={styles.eyebrow}>Synthetic profile</p>
              <h2 className={styles.profileName} id="wardline-profile-name">
                {selected.name}
              </h2>
              <p className={styles.vital}>
                {selected.id}
                {born ? ` · Born ${born}` : ''}
              </p>

              <section className={styles.section} aria-labelledby="wardline-local-ids">
                <h3 className={styles.sectionTitle} id="wardline-local-ids">
                  Local identifiers
                </h3>
                {identifiers.length === 0 ? (
                  <p className={styles.absent}>{NONE_RECORDED}</p>
                ) : (
                  <dl className={styles.ids}>
                    {identifiers.map(([key, value]) => (
                      <div key={key} className={styles.idCell}>
                        <dt className={styles.idLabel}>{humanizeKey(key)}</dt>
                        <dd className={styles.idValue}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>

              <section className={styles.section} aria-labelledby="wardline-conditions">
                <h3 className={styles.sectionTitle} id="wardline-conditions">
                  Conditions
                </h3>
                <ChipList values={selected.conditions} />
              </section>

              <section className={styles.section} aria-labelledby="wardline-needs">
                <h3 className={styles.sectionTitle} id="wardline-needs">
                  Needs
                </h3>
                <ChipList values={selected.needs} />
              </section>

              <section className={styles.section} aria-labelledby="wardline-goals">
                <h3 className={styles.sectionTitle} id="wardline-goals">
                  Goals
                </h3>
                <ChipList values={selected.goals} />
              </section>

              <section className={styles.section} aria-labelledby="wardline-linked-tasks">
                <h3 className={styles.sectionTitle} id="wardline-linked-tasks">
                  Linked tasks ({linkedTasks.length})
                </h3>
                {linkedTasks.length === 0 ? (
                  <p className={styles.absent}>No linked tasks in the current scan.</p>
                ) : (
                  <ul className={styles.taskList}>
                    {linkedTasks.map((task) => (
                      <li key={task.id} className={styles.task}>
                        <p className={styles.taskTitle}>{task.title}</p>
                        <p className={styles.taskMeta}>
                          {siteLabel(task.site)} · {task.status}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </article>
          ) : (
            <div className={styles.profileEmpty}>
              <span className={styles.plus} aria-hidden="true" />
              <p className={styles.profileEmptyCopy}>
                Select a synthetic patient profile to inspect it.
              </p>
            </div>
          )}
        </div>
      </div>
      {selected ? (
        <BloodWorkflowTimeline
          workflows={selectedWorkflows}
          heading={
            hasBlood && hasCt
              ? `Diagnostic pathway latency · ${selected.name}`
              : `${selectedWorkflows[0]?.panelName ?? 'Diagnostic pathway'} · ${selected.name}`
          }
          note={
            hasSeedTrack
              ? 'Stage times are labelled retrospective synthetic events. Gaps are measured differences between those authored times, not live laboratory or PACS clocks.'
              : hasMedTrack
                ? 'Stages come from the local MedLatency presentation. Fixture replays are authored interpretations, not live model output.'
                : 'Panels and analytes that share a timestamp are one blood-test step. Gaps are measured differences, not estimates.'
          }
        />
      ) : null}
    </section>
  )
}
