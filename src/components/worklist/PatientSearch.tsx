'use client'

import { useState, type FormEvent, type ReactElement } from 'react'
import Link from 'next/link'
import { Button, EmptyState, Text } from '@/design'
import { ageFrom } from '@/ctl/normalise/resources'
import type { Sourced } from '@/ctl/contracts'
import type { PatientPage } from './types'
import { absent } from './format'
import styles from './patient-search.module.css'

const PAGE_SIZE = 30

export function PatientSearch({ now }: { now: number }): ReactElement {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Sourced<PatientPage> | null>(null)

  async function load(nextQuery: string, nextOffset: number): Promise<void> {
    setBusy(true)
    try {
      const params = new URLSearchParams()
      params.set('q', nextQuery)
      params.set('offset', String(nextOffset))
      const response = await fetch(`/api/ctl/patients?${params.toString()}`, { cache: 'no-store' })
      const body = (await response.json()) as Sourced<PatientPage>
      setResult(body)
      setOffset(nextOffset)
      setSubmitted(nextQuery)
    } catch (error) {
      setResult({
        data: { total: 0, items: [], offset: nextOffset },
        fetchedAt: Date.now(),
        stale: false,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    void load(trimmed, 0)
  }

  const page = result?.data
  const canPrev = offset > 0
  const canNext = page ? offset + PAGE_SIZE < page.total : false

  return (
    <section className={styles.block} aria-labelledby="patient-search-heading">
      <Text as="p" size="meta" tone="muted">
        Directory search
      </Text>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>
          <span className={styles.label} id="patient-search-heading">
            Patient directory (name, id, condition, need, care goal)
          </span>
          <input
            className={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            name="q"
            type="search"
            autoComplete="off"
            placeholder="Search the 50,000-patient directory"
          />
        </label>
        <Button type="submit" variant="secondary" busy={busy}>
          Search
        </Button>
      </form>

      {result?.error ? (
        <Text as="p" size="body" tone="blocked">
          {result.error}
        </Text>
      ) : null}

      {page && submitted && page.items.length === 0 && !result?.error ? (
        <EmptyState
          title="No directory matches"
          body={`No patients matched “${submitted}” in this page of the directory.`}
        />
      ) : null}

      {page && page.items.length > 0 ? (
        <>
          <ul className={styles.results}>
            {page.items.map((patient) => {
              const age = now > 0 ? ageFrom(patient.birthDate, now) : undefined
              const ageLabel = age === undefined ? absent('age') : `${age}`
              return (
                <li key={patient.id} className={styles.hit}>
                  <Link href={`/patient/${patient.id}`} className={styles.link}>
                    {patient.name}, {ageLabel}
                  </Link>
                  <Text as="p" size="meta" tone="muted" data>
                    {patient.id}
                    {patient.conditions.length > 0 ? ` · ${patient.conditions.join(', ')}` : ''}
                  </Text>
                </li>
              )
            })}
          </ul>
          <div className={styles.pager}>
            <Text as="p" size="meta" tone="muted">
              {page.items.length} of {page.total} matching · offset {page.offset} · page size {PAGE_SIZE}
            </Text>
            <Button
              variant="silent"
              size="sm"
              disabled={!canPrev || busy}
              onClick={() => void load(submitted, Math.max(0, offset - PAGE_SIZE))}
            >
              Previous page
            </Button>
            <Button
              variant="silent"
              size="sm"
              disabled={!canNext || busy}
              onClick={() => void load(submitted, offset + PAGE_SIZE)}
            >
              Next page
            </Button>
          </div>
        </>
      ) : null}
    </section>
  )
}
