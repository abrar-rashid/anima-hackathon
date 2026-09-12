/**
 * The one committed palette for the neighbourhood.
 *
 * Every hue is a four-step ramp so that any surface can be shaded rather than
 * flat-filled: `dark` for occluded faces and outlines-in-colour, `base` for the
 * lit-but-flat plane, `light` for the plane facing the sun, `highlight` for the
 * top edge and specular pixels. Two-value dithering between adjacent steps is
 * how gradients are made; there is no alpha blending inside a sprite.
 *
 * Pure module: no canvas, no DOM, no clock.
 */

export interface Ramp {
  /** Deepest value. Used for cast shadow and the underside of a form. */
  dark: string
  /** The mid value that carries the identity of the material. */
  base: string
  /** The plane turned toward the light. */
  light: string
  /** Top edge and specular pixels only; never a large area. */
  highlight: string
}

export type RampStep = keyof Ramp

export const RAMP_STEPS: readonly RampStep[] = ['dark', 'base', 'light', 'highlight']

/** Near-black used for sprite outlines. Never pure #000 — it reads as a hole. */
export const INK = '#14131c'
export const INK_SOFT = '#241f30'

export const PALETTE = {
  grass: { dark: '#1f4a2b', base: '#2c6238', light: '#3f7d47', highlight: '#5aa05f' },
  grassDry: { dark: '#4a5327', base: '#66703a', light: '#869150', highlight: '#a8b26c' },
  soil: { dark: '#3d2b1d', base: '#5c4330', light: '#7d5f45', highlight: '#9c7c5d' },
  paving: { dark: '#3e404b', base: '#5b5e6b', light: '#7d8290', highlight: '#a3a9b8' },
  kerb: { dark: '#4a4433', base: '#6b6450', light: '#8d866d', highlight: '#b0a88c' },
  plaster: { dark: '#6b5847', base: '#94806a', light: '#b8a68c', highlight: '#dccdb2' },
  brick: { dark: '#54302a', base: '#77463a', light: '#9a5c4a', highlight: '#b87765' },
  slate: { dark: '#232634', base: '#343a4d', light: '#4a5266', highlight: '#6b7488' },
  glass: { dark: '#22293a', base: '#33405a', light: '#4d6284', highlight: '#7690b0' },
  glassLit: { dark: '#8a6a2a', base: '#d5a33e', light: '#f0cd70', highlight: '#fff2c0' },
  wood: { dark: '#3a2718', base: '#573c26', light: '#78573a', highlight: '#9c7550' },
  paper: { dark: '#a4977a', base: '#d6c9a8', light: '#efe5cc', highlight: '#fffaea' },
  steel: { dark: '#33384a', base: '#4e5570', light: '#737c96', highlight: '#9ea6bd' },
  coat: { dark: '#8f8d93', base: '#c3c2c8', light: '#e2e1e6', highlight: '#f7f6f9' },
  nhsBlue: { dark: '#12314f', base: '#1c4d7c', light: '#2a6ea6', highlight: '#4f95c9' },
  hiVis: { dark: '#8a6a11', base: '#c49b1c', light: '#e9c437', highlight: '#ffe87a' },
  agent: { dark: '#3b2a63', base: '#5b4194', light: '#7e60c0', highlight: '#b49ce6' },
  amber: { dark: '#7a4a10', base: '#b3721a', light: '#dd9a2c', highlight: '#f5c45e' },
  alarm: { dark: '#6d1f21', base: '#9c2f2c', light: '#c8483c', highlight: '#e8776a' },
  calm: { dark: '#14493f', base: '#1d6a58', light: '#2a8c72', highlight: '#4cb193' },
  lamp: { dark: '#6b5a1e', base: '#a58c2c', light: '#e0c352', highlight: '#fff0a8' },
} as const satisfies Record<string, Ramp>

export type PaletteName = keyof typeof PALETTE

/** Three skin ramps. Picked by a stable hash of an id, never at random. */
export const SKIN_RAMPS: readonly Ramp[] = [
  { dark: '#7a4a30', base: '#a6714d', light: '#c99871', highlight: '#e4bb96' },
  { dark: '#513021', base: '#75492f', light: '#96674a', highlight: '#b98c6c' },
  { dark: '#2f1c14', base: '#4c2f21', light: '#6b4632', highlight: '#8d6249' },
]

/** Casual clothing ramps for patient and resident sprites. */
export const CIVIC_RAMPS: readonly Ramp[] = [
  { dark: '#5b2a3f', base: '#82405b', light: '#a45c78', highlight: '#c68298' },
  { dark: '#254a4f', base: '#356a70', light: '#4a8d93', highlight: '#6db2b7' },
  { dark: '#4d3a1f', base: '#6f552d', light: '#91743f', highlight: '#b49659' },
  { dark: '#2c3358', base: '#404a7c', light: '#5b68a1', highlight: '#8290c2' },
]

/** Deterministic index from a string. Pure; used instead of Math.random. */
export function hashIndex(seed: string, length: number): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % Math.max(1, length)
}

// ---------------------------------------------------------------------------
// Ramps derived from a source colour
// ---------------------------------------------------------------------------

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHex(hex: string): Rgb | null {
  const clean = hex.trim().replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function toHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

const SHADE = { r: 18, g: 16, b: 30 }
const TINT = { r: 255, g: 246, b: 226 }

/**
 * Build a four-step ramp from a single source colour.
 *
 * Site roof colours come from `GET /api/catalogue`, which supplies one hex per
 * site. Shading them means deriving the missing steps rather than inventing a
 * second colour, so the roofs stay recognisably the catalogue colour.
 */
export function rampFromHex(hex: string, fallback: Ramp = PALETTE.slate): Ramp {
  const rgb = parseHex(hex)
  if (!rgb) return fallback
  return {
    dark: toHex(mix(rgb, SHADE, 0.45)),
    base: toHex(rgb),
    light: toHex(mix(rgb, TINT, 0.26)),
    highlight: toHex(mix(rgb, TINT, 0.52)),
  }
}

// ---------------------------------------------------------------------------
// Day and night, driven by the simulator clock
// ---------------------------------------------------------------------------

export type PhaseId = 'night' | 'dawn' | 'day' | 'dusk'

export interface SkyPhase {
  id: PhaseId
  /** Human label for the HUD; the hour itself is rendered alongside it. */
  label: string
  /** Vertical sky gradient, top to horizon, as two dithered bands. */
  skyTop: Ramp
  skyHorizon: Ramp
  /** Flat wash laid over the world layer to carry the hour. */
  washHex: string
  washAlpha: number
  /** Windows use the lit ramp when true. */
  windowsLit: boolean
  /** Cast-shadow direction and length multiplier. Long at dawn and dusk. */
  shadowDx: number
  shadowDy: number
  shadowLength: number
  shadowAlpha: number
  /** Street lamps glow when true. */
  lampsLit: boolean
}

const NIGHT_SKY_TOP: Ramp = { dark: '#06070f', base: '#0d1026', light: '#191f44', highlight: '#2b3468' }
const NIGHT_SKY_HORIZON: Ramp = { dark: '#131938', base: '#1f2750', light: '#33406e', highlight: '#4d5c90' }

const PHASES: Record<PhaseId, Omit<SkyPhase, 'shadowDx' | 'shadowDy' | 'shadowLength'>> = {
  night: {
    id: 'night',
    label: 'night',
    skyTop: NIGHT_SKY_TOP,
    skyHorizon: NIGHT_SKY_HORIZON,
    washHex: '#101638',
    washAlpha: 0.46,
    windowsLit: true,
    shadowAlpha: 0.1,
    lampsLit: true,
  },
  dawn: {
    id: 'dawn',
    label: 'dawn',
    skyTop: { dark: '#2b2c55', base: '#4b4477', light: '#7a6491', highlight: '#c08f8a' },
    skyHorizon: { dark: '#7a5a6a', base: '#b4808a', light: '#dba892', highlight: '#f2cfa4' },
    washHex: '#4a3a62',
    washAlpha: 0.2,
    windowsLit: true,
    shadowAlpha: 0.18,
    lampsLit: true,
  },
  day: {
    id: 'day',
    label: 'day',
    skyTop: { dark: '#2d6ba8', base: '#4a8fc9', light: '#74b0dd', highlight: '#a6d2ee' },
    skyHorizon: { dark: '#74b0dd', base: '#a6d2ee', light: '#cbe6f6', highlight: '#eaf6fd' },
    washHex: '#ffe9bd',
    washAlpha: 0.0,
    windowsLit: false,
    shadowAlpha: 0.24,
    lampsLit: false,
  },
  dusk: {
    id: 'dusk',
    label: 'dusk',
    skyTop: { dark: '#232a56', base: '#3d3b70', light: '#6b4f83', highlight: '#a5638b' },
    skyHorizon: { dark: '#8a4a52', base: '#c06a52', light: '#e29a5c', highlight: '#f6c882' },
    washHex: '#6b3a4a',
    washAlpha: 0.26,
    windowsLit: true,
    shadowAlpha: 0.2,
    lampsLit: true,
  },
}

/** UTC hour-of-day from an epoch, as a float. */
export function hourOf(nowMs: number): number {
  const d = new Date(nowMs)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}

export function phaseIdFor(nowMs: number): PhaseId {
  const h = hourOf(nowMs)
  if (h < 5 || h >= 21) return 'night'
  if (h < 8) return 'dawn'
  if (h < 18) return 'day'
  return 'dusk'
}

/**
 * Sky, window and shadow state for a simulator instant.
 *
 * The shadow vector swings from long-and-west at dawn through short-and-south
 * at noon to long-and-east at dusk, so the town reads the hour without a label.
 */
export function phaseFor(nowMs: number): SkyPhase {
  const id = phaseIdFor(nowMs)
  const h = hourOf(nowMs)
  const preset = PHASES[id]

  // Sun travels 06:00 -> 20:00 across the sky; outside that it is below.
  const t = Math.max(0, Math.min(1, (h - 6) / 14))
  const angle = Math.PI * (1 - t)
  const elevation = Math.sin(angle)
  const longShadow = id === 'dawn' || id === 'dusk'

  return {
    ...preset,
    shadowDx: id === 'night' ? 0.35 : Math.cos(angle) * -1,
    shadowDy: id === 'night' ? 0.6 : Math.max(0.28, 1 - elevation * 0.6),
    shadowLength: id === 'night' ? 0.5 : longShadow ? 2.6 : 1 + (1 - elevation) * 1.4,
  }
}

/** Breach colours. Amber then red as a deadline recedes. Time only, no clinical claim. */
export function breachRamp(state: 'breached' | 'due-soon' | 'on-time' | 'no-deadline'): Ramp {
  if (state === 'breached') return PALETTE.alarm
  if (state === 'due-soon') return PALETTE.amber
  if (state === 'on-time') return PALETTE.calm
  return PALETTE.paving
}
