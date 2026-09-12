'use client'

import { useState, type ReactElement } from 'react'
import { Heading, Skeleton, Surface, Text } from '@/design'
import { ProtocolLab } from '@/components/ProtocolLab'
import { ScanNotice } from '@/components/worklist/ScanNotice'
import { formatScanWindow, formatSimTime } from '@/components/worklist/format'
import { BottleneckRank } from './BottleneckRank'
import { LatencySteps } from './LatencySteps'
import { LoopBreakage } from './LoopBreakage'
import type { InsightsSourced } from './types'
import styles from './insights.module.css'

const PROTOCOL_TWIN_CASE_ID = 'case-SIM-000001-blood-v1-SIM-000001-crp-5'

export function InsightsView({ initial }: { initial: InsightsSourced }): ReactElement {
  const [sourced, setSourced] = useState(initial)
  const [busy, setBusy] = useState(false)
  const report = sourced.data.report

  async function retry(): Promise<void> {
    setBusy(true)
    try {
      const response = await fetch('/api/ctl/insights', { cache: 'no-store' })
      const body = (await response.json()) as InsightsSourced
      setSourced(body)
    } catch (error) {
      setSourced({
        ...sourced,
        stale: sourced.data.report.window.scanned > 0,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.lede}>
        <Heading as="h1" size="hero">
          Where the neighbourhood loses time
        </Heading>
        <Text size="lead" measure>
          Step latency and loop breakage computed from provenance. This is a fictional NHS
          neighbourhood. No real patients. No clinical outcome is claimed.
        </Text>
        <Text as="p" size="meta" tone="muted" data>
          Scan window: {formatScanWindow(report.window)}. Simulator now {formatSimTime(report.window.now)}.
        </Text>
      </header>

      <ScanNotice
        stale={sourced.stale}
        fetchedAt={sourced.fetchedAt}
        error={sourced.error}
        window={report.window}
        sites={sourced.data.sites}
        onRetry={() => void retry()}
        busy={busy}
      />

      {busy ? (
        <Skeleton label="Refreshing latency. The previous figures remain until this returns." bars={4} />
      ) : null}

      <LatencySteps steps={report.steps} />
      <BottleneckRank steps={report.steps} />
      <LoopBreakage rates={report.breakage} />

      <Surface as="section" padding="lg" labelledBy="protocol-twin-heading">
        <div className={styles.twin}>
          <Heading as="h2" size="title" id="protocol-twin-heading">
            What if we changed the protocol
          </Heading>
          <Text size="body" measure>
            Replay one immutable synthetic trace through the existing protocol twin. Side-effect-free.
            It does not write to the simulator.
          </Text>
          <ProtocolLab caseId={PROTOCOL_TWIN_CASE_ID} />
        </div>
      </Surface>
    </div>
  )
}
