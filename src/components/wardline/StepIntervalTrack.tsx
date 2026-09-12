'use client'

import { chainsForResource, formatStepDuration, gapWidths, longestGap } from './step-intervals'
import type { WardlineStepChain } from './step-intervals'
import styles from './step-interval-track.module.css'

function toneFor(ms: number, maxMs: number): 'ok' | 'wait' | 'long' {
  if (maxMs <= 0) return 'ok'
  const share = ms / maxMs
  if (share >= 0.6) return 'long'
  if (share >= 0.25) return 'wait'
  return 'ok'
}

function ChainRow({ chain }: { chain: WardlineStepChain }) {
  const widths = gapWidths(chain.gaps.map((gap) => gap.elapsedMs))
  const maxMs = Math.max(...chain.gaps.map((gap) => gap.elapsedMs), 1)

  return (
    <article className={styles.chain}>
      <header className={styles.chainHead}>
        <p className={styles.chainMeta}>
          {chain.site} · {chain.kind} · {chain.resourceId}
        </p>
        <h3 className={styles.chainTitle}>{chain.title}</h3>
      </header>
      <ol className={styles.track} aria-label={`Provenance waits on ${chain.title}`}>
        {chain.nodes.map((node, index) => {
          const gap = chain.gaps[index]
          const width = gap ? widths[index] : undefined
          return (
            <li key={`${chain.resourceId}:${node.time}:${node.action}:${index}`} className={styles.step}>
              <div className={styles.node}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.nodeLabel}>{node.label}</span>
              </div>
              {gap && width !== undefined ? (
                <div
                  className={styles.gap}
                  style={{ flexGrow: Math.max(width * 100, 8) }}
                  data-tone={toneFor(gap.elapsedMs, maxMs)}
                >
                  <span className={styles.gapBar} aria-hidden="true" />
                  <span className={styles.gapLabel}>
                    {formatStepDuration(gap.elapsedMs)}
                    <span className={styles.gapHint}>
                      {' '}
                      {gap.fromLabel} → {gap.toLabel}
                    </span>
                  </span>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </article>
  )
}

export function StepIntervalTrack({
  chains,
  compact = false,
  focusResourceId,
  title = 'Time between successive steps',
}: {
  chains: WardlineStepChain[]
  compact?: boolean
  focusResourceId?: string
  title?: string
}) {
  const focused = chainsForResource(chains, focusResourceId)
  const featured = focused ? [focused] : chains.slice(0, compact ? 1 : 4)
  const slowest = longestGap(chains)
  const observed = chains.reduce((sum, chain) => sum + chain.gaps.length, 0)

  if (compact) {
    return (
      <section className={`${styles.strip} ${styles.compact}`} aria-labelledby="step-interval-heading">
        <div className={styles.stripCopy}>
          <p className={styles.kicker} id="step-interval-heading">
            {title}
          </p>
          {slowest ? (
            <p className={styles.stripLead}>
              Slowest observed wait:{' '}
              <strong>
                {slowest.gap.fromLabel} → {slowest.gap.toLabel}
              </strong>{' '}
              · {formatStepDuration(slowest.gap.elapsedMs)} · {slowest.chain.title}
            </p>
          ) : (
            <p className={styles.stripLead}>No successive provenance actions in this scan window.</p>
          )}
          <p className={styles.note}>
            {observed} measured transition{observed === 1 ? '' : 's'} from record audit trails. Not
            estimated.
          </p>
        </div>
        {featured[0] ? <ChainRow chain={featured[0]} /> : null}
      </section>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="step-interval-heading">
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>{title}</p>
          <h2 className={styles.title} id="step-interval-heading">
            Observed waits on the audit trail
          </h2>
          <p className={styles.note}>
            Each bar is the elapsed simulator time between two consecutive provenance actions on the
            same record. Width is log-scaled so a multi-day wait does not hide a short one. n ={' '}
            {observed}.
          </p>
        </div>
        {slowest ? (
          <p className={styles.stat}>
            <span>Longest gap</span>
            <strong>{formatStepDuration(slowest.gap.elapsedMs)}</strong>
            <em>
              {slowest.gap.fromLabel} → {slowest.gap.toLabel}
            </em>
          </p>
        ) : null}
      </header>
      {featured.length === 0 ? (
        <p className={styles.empty}>No successive provenance steps were present in this scan.</p>
      ) : (
        <div className={styles.list}>
          {featured.map((chain) => (
            <ChainRow key={chain.resourceId} chain={chain} />
          ))}
        </div>
      )}
    </section>
  )
}
