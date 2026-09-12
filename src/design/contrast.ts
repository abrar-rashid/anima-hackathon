export type ContrastMinimum = 3 | 4.5

export type ContrastPair = {
  name: string
  foreground: string
  background: string
  minimum: ContrastMinimum
  usage: string
}

function channel(value: number): number {
  const next = value / 255
  return next <= 0.04045 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4
}

export function parseHex(hex: string): [number, number, number] {
  const raw = hex.replace('#', '')
  if (raw.length !== 6) {
    throw new Error(`contrast tokens use 6-digit hex, received ${hex}`)
  }
  return [0, 2, 4].map((index) => Number.parseInt(raw.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ]
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

export const COLOR = {
  canvas: '#DDE1E6',
  raised: '#F4F6F8',
  inset: '#CED3DA',
  owned: '#C5D4EE',
  awaiting: '#F0DFC0',
  proven: '#C5E0CF',
  blocked: '#F0D0D4',
  unverified: '#D5D8DE',
  disabled: '#C8CDD4',
  secondary: '#C9D0D8',
  secondaryHover: '#B8BFC8',
  action: '#163A8A',
  actionHover: '#0B2F6E',
  danger: '#9B1D32',
  dangerHover: '#7A1628',
  ink: '#14181F',
  muted: '#3D4553',
  onAction: '#F4F6F8',
  textOwned: '#163A8A',
  textAwaiting: '#7A4E00',
  textProven: '#145C32',
  textBlocked: '#9B1D32',
  textUnverified: '#3D4450',
  textDisabled: '#353C4A',
  placeholder: '#4A5160',
  border: '#5C6472',
  focus: '#0B3D91',
} as const

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { name: 'ink on canvas', foreground: COLOR.ink, background: COLOR.canvas, minimum: 4.5, usage: 'Body copy on the enamel field' },
  { name: 'muted on canvas', foreground: COLOR.muted, background: COLOR.canvas, minimum: 4.5, usage: 'Secondary copy on the enamel field' },
  { name: 'ink on raised', foreground: COLOR.ink, background: COLOR.raised, minimum: 4.5, usage: 'Body copy on raised instrument window' },
  { name: 'muted on raised', foreground: COLOR.muted, background: COLOR.raised, minimum: 4.5, usage: 'Secondary copy on raised surface' },
  { name: 'ink on inset', foreground: COLOR.ink, background: COLOR.inset, minimum: 4.5, usage: 'Body copy on inset wells' },
  { name: 'muted on inset', foreground: COLOR.muted, background: COLOR.inset, minimum: 4.5, usage: 'Secondary copy on inset wells' },
  { name: 'on-action on action', foreground: COLOR.onAction, background: COLOR.action, minimum: 4.5, usage: 'Primary button label' },
  { name: 'on-action on action-hover', foreground: COLOR.onAction, background: COLOR.actionHover, minimum: 4.5, usage: 'Primary button hover label' },
  { name: 'on-action on danger', foreground: COLOR.onAction, background: COLOR.danger, minimum: 4.5, usage: 'Danger button label' },
  { name: 'on-action on danger-hover', foreground: COLOR.onAction, background: COLOR.dangerHover, minimum: 4.5, usage: 'Danger button hover label' },
  { name: 'owned on canvas', foreground: COLOR.textOwned, background: COLOR.canvas, minimum: 4.5, usage: 'Owned state text on field' },
  { name: 'awaiting on canvas', foreground: COLOR.textAwaiting, background: COLOR.canvas, minimum: 4.5, usage: 'Awaiting state text on field' },
  { name: 'proven on canvas', foreground: COLOR.textProven, background: COLOR.canvas, minimum: 4.5, usage: 'Proven state text on field' },
  { name: 'blocked on canvas', foreground: COLOR.textBlocked, background: COLOR.canvas, minimum: 4.5, usage: 'Blocked state text on field' },
  { name: 'unverified on canvas', foreground: COLOR.textUnverified, background: COLOR.canvas, minimum: 4.5, usage: 'Unverified state text on field' },
  { name: 'owned on owned surface', foreground: COLOR.textOwned, background: COLOR.owned, minimum: 4.5, usage: 'Owned badge and owned wells' },
  { name: 'awaiting on awaiting surface', foreground: COLOR.textAwaiting, background: COLOR.awaiting, minimum: 4.5, usage: 'Awaiting badge and awaiting wells' },
  { name: 'proven on proven surface', foreground: COLOR.textProven, background: COLOR.proven, minimum: 4.5, usage: 'Proven badge and proven wells' },
  { name: 'blocked on blocked surface', foreground: COLOR.textBlocked, background: COLOR.blocked, minimum: 4.5, usage: 'Blocked badge and blocked wells' },
  { name: 'unverified on unverified surface', foreground: COLOR.textUnverified, background: COLOR.unverified, minimum: 4.5, usage: 'Unverified badge and unfinished wells' },
  { name: 'disabled on disabled surface', foreground: COLOR.textDisabled, background: COLOR.disabled, minimum: 4.5, usage: 'Disabled control label' },
  { name: 'placeholder on raised', foreground: COLOR.placeholder, background: COLOR.raised, minimum: 4.5, usage: 'Placeholder copy in fields' },
  { name: 'placeholder on canvas', foreground: COLOR.placeholder, background: COLOR.canvas, minimum: 4.5, usage: 'Placeholder copy on field' },
  { name: 'focus on canvas', foreground: COLOR.focus, background: COLOR.canvas, minimum: 3, usage: 'Focus ring against the enamel field' },
  { name: 'border on canvas', foreground: COLOR.border, background: COLOR.canvas, minimum: 3, usage: 'Component boundary against the field' },
  { name: 'border on raised', foreground: COLOR.border, background: COLOR.raised, minimum: 3, usage: 'Component boundary against raised surface' },
  { name: 'ink on owned surface', foreground: COLOR.ink, background: COLOR.owned, minimum: 4.5, usage: 'Primary copy inside owned wells' },
  { name: 'ink on awaiting surface', foreground: COLOR.ink, background: COLOR.awaiting, minimum: 4.5, usage: 'Primary copy inside awaiting wells' },
  { name: 'ink on proven surface', foreground: COLOR.ink, background: COLOR.proven, minimum: 4.5, usage: 'Primary copy inside proven wells' },
  { name: 'ink on blocked surface', foreground: COLOR.ink, background: COLOR.blocked, minimum: 4.5, usage: 'Primary copy inside blocked wells' },
  { name: 'ink on secondary', foreground: COLOR.ink, background: COLOR.secondary, minimum: 4.5, usage: 'Secondary button label' },
  { name: 'ink on secondary-hover', foreground: COLOR.ink, background: COLOR.secondaryHover, minimum: 4.5, usage: 'Secondary button hover label' },
  { name: 'action-hover on canvas', foreground: COLOR.actionHover, background: COLOR.canvas, minimum: 4.5, usage: 'Pressed / hover link on field' },
  { name: 'on-action on ink', foreground: COLOR.onAction, background: COLOR.ink, minimum: 4.5, usage: 'Tooltip label on iron ink' },
]
