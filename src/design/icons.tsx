import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const base: SVGProps<SVGSVGElement> = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 16 16',
  fill: 'none',
  'aria-hidden': true,
  focusable: false,
}

function IconShell({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      {...base}
      {...props}
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export function IconIdle(props: IconProps) {
  return (
    <IconShell {...props}>
      <circle cx="8" cy="8" r="5.2" />
    </IconShell>
  )
}

export function IconOwned(props: IconProps) {
  return (
    <IconShell {...props}>
      <polygon points="8,1.6 14.4,8 8,14.4 1.6,8" fill="currentColor" />
    </IconShell>
  )
}

export function IconAwaiting(props: IconProps) {
  return (
    <IconShell {...props}>
      <polygon points="8,2 14.4,13.4 1.6,13.4" />
    </IconShell>
  )
}

export function IconProven(props: IconProps) {
  return (
    <IconShell {...props}>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="1" />
      <polyline points="4.6,8.2 7.1,10.6 11.4,5.6" />
    </IconShell>
  )
}

export function IconBlocked(props: IconProps) {
  return (
    <IconShell {...props}>
      <polygon points="5.2,1.8 10.8,1.8 14.2,5.2 14.2,10.8 10.8,14.2 5.2,14.2 1.8,10.8 1.8,5.2" />
      <line x1="5.4" y1="5.4" x2="10.6" y2="10.6" />
      <line x1="10.6" y1="5.4" x2="5.4" y2="10.6" />
    </IconShell>
  )
}

export function IconUnverified(props: IconProps) {
  return (
    <IconShell {...props}>
      <polyline points="8,1.6 14.4,8 8,14.4 1.6,8 4,5.6" />
    </IconShell>
  )
}

export const STATE_ICONS = {
  idle: IconIdle,
  owned: IconOwned,
  awaiting: IconAwaiting,
  proven: IconProven,
  blocked: IconBlocked,
  unverified: IconUnverified,
} as const
