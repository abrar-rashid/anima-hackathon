'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Site } from '@/ctl/contracts'
import { useReducedMotion } from '@/components/world/use-reduced-motion'
import styles from './neighbourhood.module.css'
import { AccessibleNeighbourhood } from './AccessibleNeighbourhood'
import { NeighbourhoodCanvas, type TownControls } from './NeighbourhoodCanvas'
import { SiteDrawer } from './SiteDrawer'
import { formatClockTime, formatCount, formatSimTime, withDenominator } from './format'
import { DEFAULT_ZOOM, type Zoom } from './layout'
import { PALETTE, phaseFor } from './palette'
import type { TownDoc, TownModel } from './model'

export interface NeighbourhoodViewProps {
  initial: TownModel
}

const POLL_MS = 20_000

/** Hours offered by the lighting preview. Labelled as a preview, never as data. */
const PREVIEW_HOURS = [3, 6, 9, 13, 18, 20, 23] as const

function atHour(now: number, hour: number): number {
  const day = Math.floor(now / 86_400_000) * 86_400_000
  return day + hour * 3_600_000
}

export function NeighbourhoodView({ initial }: NeighbourhoodViewProps) {
  const reduced = useReducedMotion()
  const [model, setModel] = useState<TownModel>(initial)
  const [selected, setSelected] = useState<Site | null>(null)
  const [hovered, setHovered] = useState<Site | null>(null)
  const [zoom, setZoom] = useState<Zoom>(DEFAULT_ZOOM)
  const [busy, setBusy] = useState(false)
  const [agentLines, setAgentLines] = useState<string[]>([])
  const [agentSource, setAgentSource] = useState<TownDoc | null>(null)
  const [previewHour, setPreviewHour] = useState<number | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const controls = useRef<TownControls | null>(null)
  const minimapRef = useRef<HTMLCanvasElement | null>(null)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/ctl/town', { cache: 'no-store' })
      const body: unknown = await response.json()
      if (body && typeof body === 'object' && 'model' in body) {
        setModel((body as { model: TownModel }).model)
        setRefreshError(null)
      } else {
        setRefreshError('refresh returned an unexpected body')
      }
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const onAgentSays = useCallback((lines: string[], source: TownDoc | null) => {
    setAgentLines(lines)
    setAgentSource(source)
  }, [])

  const phase = useMemo(
    () => phaseFor(previewHour === null ? model.now : atHour(model.now, previewHour)),
    [previewHour, model.now],
  )

  const selectedSite = selected ? model.sites.find((site) => site.site === selected) ?? null : null
  const hoveredSite = hovered ? model.sites.find((site) => site.site === hovered) ?? null : null
  const totalUnclosed = model.sites.reduce((sum, site) => sum + site.work.length, 0)
  const totalBreached = model.sites.reduce((sum, site) => sum + site.breachedCount, 0)
  const routedDocs = model.docs.filter((doc) => doc.routed.length >= 2).length

  const focusSite = useCallback((site: Site) => {
    setSelected(site)
    controls.current?.focusSite(site)
  }, [])

  const onMinimapClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    controls.current?.focusFromMinimap(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    )
  }, [])

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#neighbourhood-as-data">
        Skip the map and read the neighbourhood as data
      </a>

      <div className={styles.shell} data-aside={selectedSite ? 'open' : 'closed'}>
        <header className={styles.header}>
          <h1 className={styles.title}>The neighbourhood</h1>
          <p className={styles.headerNote}>
            Synthetic simulator world. Every building, name, count and document is a field from an
            Anima simulator response.
          </p>
          <nav className={styles.headerLinks}>
            <Link href="/">Worklist</Link>
            <Link href="/insights">Insights</Link>
          </nav>
        </header>

        <div className={styles.rail}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Simulator clock</h2>
            <div className={styles.clockNow}>{formatClockTime(model.now)}</div>
            <p className={styles.clockMeta}>{formatSimTime(model.now)}</p>
            <div className={styles.badgeRow}>
              <span className={styles.badge}>{model.paused ? 'paused' : `speed ${model.speed}x`}</span>
              <span className={styles.badge}>
                {previewHour === null ? `${phase.label} lighting` : `preview: ${phase.label}`}
              </span>
              {model.stale ? (
                <span className={`${styles.badge} ${styles.badgeWarn}`}>
                  stale · read {formatClockTime(model.fetchedAt)}
                </span>
              ) : (
                <span className={`${styles.badge} ${styles.badgeOk}`}>live</span>
              )}
              {busy ? <span className={`${styles.badge} ${styles.badgeWarn}`}>reading</span> : null}
            </div>
            {model.error ? <p className={styles.banner}>{model.error}</p> : null}
            {refreshError ? (
              <p className={styles.banner}>last refresh failed: {refreshError}</p>
            ) : null}
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>View</h2>
            <div className={styles.controls}>
              <button type="button" className={styles.button} onClick={() => controls.current?.zoomOut()}>
                − zoom
              </button>
              <span className={styles.zoomValue}>{zoom}x</span>
              <button type="button" className={styles.button} onClick={() => controls.current?.zoomIn()}>
                + zoom
              </button>
              <button type="button" className={styles.button} onClick={() => controls.current?.reset()}>
                reset
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => void refresh()}
                disabled={busy}
              >
                {busy ? 'reading…' : 'read again'}
              </button>
            </div>
            <canvas
              ref={minimapRef}
              className={styles.minimap}
              onClick={onMinimapClick}
              aria-hidden="true"
            />
            <p className={styles.note}>
              Zoom is integer-only so the pixels stay square. Click the minimap to jump.
            </p>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Sites from the catalogue</h2>
            <ul className={styles.siteList}>
              {model.sites.map((site) => (
                <li key={site.site}>
                  <button
                    type="button"
                    className={`${styles.siteButton} ${
                      selected === site.site ? styles.siteButtonActive : ''
                    }`}
                    onClick={() => focusSite(site.site)}
                    aria-pressed={selected === site.site}
                  >
                    <span
                      className={styles.swatch}
                      style={{ background: site.colorHex ?? PALETTE.slate.base }}
                    />
                    <span className={styles.siteButtonName}>{site.placeName ?? site.site}</span>
                    <span className={styles.siteButtonCount}>
                      {site.readFailed ? 'read failed' : `${site.work.length}/${site.breachedCount}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className={styles.note}>unclosed / past deadline, within the window each site returned</p>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Legend</h2>
            <ul className={styles.legendList}>
              <li>
                <span className={styles.swatch} style={{ background: PALETTE.alarm.base }} />
                marker past its <code>dueAt</code>
              </li>
              <li>
                <span className={styles.swatch} style={{ background: PALETTE.amber.base }} />
                marker due within 12 simulator hours
              </li>
              <li>
                <span className={styles.swatch} style={{ background: PALETTE.calm.base }} />
                marker with its deadline ahead
              </li>
              <li>
                <span className={styles.swatch} style={{ background: PALETTE.paper.base }} />
                document following an event&apos;s <code>visibleTo</code> chain
              </li>
              <li>
                <span className={styles.swatch} style={{ background: PALETTE.agent.base }} />
                agent sprite: reading, then restating what it found
              </li>
              <li>
                <span className={styles.swatch} style={{ background: PALETTE.hiVis.base }} />
                courier · <span className={styles.swatch} style={{ background: PALETTE.coat.base }} />
                clinician · <span className={styles.swatch} style={{ background: PALETTE.nhsBlue.base }} />
                nurse
              </li>
              <li>
                <span className={styles.swatch} style={{ background: PALETTE.kerb.base }} />
                signposts are non-site scopes such as <code>ambulance</code> and <code>icb</code>
              </li>
            </ul>
            <p className={styles.note}>
              Sprite counts are capped for legibility: up to {model.spriteCaps.cliniciansPerSite}{' '}
              clinicians and {model.spriteCaps.nursesPerSite} nurse per site from the real staffing
              numbers, {model.spriteCaps.residents} residents, {model.spriteCaps.documents} documents in
              flight.
            </p>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Lighting preview</h2>
            <p className={styles.note}>
              The town&apos;s hour comes from the simulator clock. This control only previews other
              hours; it changes no data.
            </p>
            <div className={styles.controls}>
              <button
                type="button"
                className={`${styles.button} ${previewHour === null ? styles.buttonActive : ''}`}
                onClick={() => setPreviewHour(null)}
              >
                clock
              </button>
              {PREVIEW_HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  className={`${styles.button} ${previewHour === hour ? styles.buttonActive : ''}`}
                  onClick={() => setPreviewHour(hour)}
                >
                  {String(hour).padStart(2, '0')}:00
                </button>
              ))}
            </div>
          </section>

          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Scan</h2>
            <p className={styles.note}>
              {withDenominator(model.scan.scanned, model.scan.total, 'resources scanned')} across{' '}
              {model.scan.sites.length} of {model.sites.length} sites.{' '}
              {formatCount(totalUnclosed)} unclosed in that window, {formatCount(totalBreached)} past a
              deadline. {formatCount(routedDocs)} of {formatCount(model.docs.length)} clock events have
              at least two scopes on the map and are drawn as documents.
            </p>
            {model.scan.failedSites.length > 0 ? (
              <p className={styles.banner}>
                reads that failed: {model.scan.failedSites.join(', ')}
              </p>
            ) : null}
          </section>
        </div>

        <NeighbourhoodCanvas
          model={model}
          phaseOverrideMs={previewHour === null ? null : atHour(model.now, previewHour)}
          reduced={reduced}
          agentBusy={busy}
          selected={selected}
          onSelect={setSelected}
          onHover={setHovered}
          onZoom={setZoom}
          onAgentSays={onAgentSays}
          controls={controls}
          minimap={minimapRef}
        />

        {selectedSite ? (
          <SiteDrawer site={selectedSite} model={model} onClose={() => setSelected(null)} />
        ) : null}

        <p className={styles.status} aria-live="polite">
          <span>
            {hoveredSite
              ? `${hoveredSite.placeName ?? hoveredSite.site} — ${hoveredSite.work.length} unclosed of ${formatCount(
                  hoveredSite.scanned,
                )} scanned, ${hoveredSite.breachedCount} past a deadline`
              : 'Hover a building to read its counts. Click it to open the drawer.'}
          </span>
          <span className={styles.statusHint}>
            {reduced ? 'animation paused for reduced motion' : `${phase.label} lighting`} · drag to pan ·
            wheel or +/− to zoom
          </span>
        </p>

        <section className={styles.ticker} aria-label="Recent simulator events">
          <p className={styles.tickerLabel}>
            Clock event stream · {formatCount(model.docs.length)} events from{' '}
            <code>GET /api/clock</code>
            {agentLines.length > 0 ? (
              <>
                {' · '}
                <span className={styles.agentChip}>
                  agent{busy ? ' reading' : ''}: {agentLines.join(' — ')}
                </span>
              </>
            ) : null}
          </p>
          <div className={styles.tickerRow}>
            {model.docs.length === 0 ? (
              <span className={styles.tickerChip}>no events returned by the clock read</span>
            ) : (
              model.docs.slice(0, 24).map((doc) => (
                <span
                  key={doc.eventId}
                  className={`${styles.tickerChip} ${
                    agentSource?.eventId === doc.eventId ? styles.tickerChipActive : ''
                  }`}
                >
                  <span className={styles.tickerTime}>{formatClockTime(doc.time)}</span>
                  <span className={styles.tickerType}>{doc.type}</span>
                  <span>{doc.detail ?? 'no detail supplied by source'}</span>
                  <span className={styles.tickerChain}>{doc.chain.join(' → ')}</span>
                </span>
              ))
            )}
          </div>
        </section>
      </div>

      <AccessibleNeighbourhood model={model} />
    </div>
  )
}
