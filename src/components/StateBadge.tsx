import styles from './case-workspace.module.css'

export type StateBadgeTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'accent'

export type StateBadgeProps = {
  label: string
  icon: string
  tone?: StateBadgeTone
}

const toneClass: Record<StateBadgeTone, string> = {
  neutral: styles.badge,
  ok: styles.badgeOk,
  warn: styles.badgeWarn,
  bad: styles.badgeBad,
  accent: styles.badgeAccent,
}

export function StateBadge({ label, icon, tone = 'neutral' }: StateBadgeProps) {
  return (
    <span className={toneClass[tone]} data-state-badge="">
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  )
}
