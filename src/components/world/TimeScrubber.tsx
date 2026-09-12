import { clockPhrase, formatSimulatorTime } from './format'
import styles from './instruments.module.css'

export type TimeScrubberProps = {
  now: number
  min: number
  max: number
  paused: boolean
  speed: number
  onSeek?: (simulatorTime: number) => void
}

export function TimeScrubber({ now, min, max, paused, speed, onSeek }: TimeScrubberProps) {
  const singleFrame = min === max
  const iso = formatSimulatorTime(now)

  return (
    <section className={styles.scrubber} aria-labelledby="world-scrubber-heading">
      <h2 id="world-scrubber-heading">Simulator time</h2>
      <p className={styles.clock}>{clockPhrase(paused, speed)}</p>
      <label>
        <span>Scrub recorded simulator time {iso}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={now}
          disabled={singleFrame || !onSeek}
          aria-valuetext={iso}
          onChange={(event) => onSeek?.(Number(event.target.value))}
        />
      </label>
      <p className={styles.clock}>
        {singleFrame
          ? 'Single recorded frame — the scrubber cannot invent other times.'
          : `${formatSimulatorTime(min)} → ${formatSimulatorTime(max)}`}
      </p>
    </section>
  )
}
