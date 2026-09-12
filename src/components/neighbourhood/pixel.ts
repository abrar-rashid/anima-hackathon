/**
 * Pixel drawing primitives.
 *
 * Everything here works in *logical pixels* on an integer grid. Sprites are
 * drawn once at 1:1 into an offscreen canvas and later blitted with
 * `imageSmoothingEnabled = false` at an integer scale, which is what keeps the
 * art crisp instead of resampled.
 *
 * The rule this module exists to enforce: no large area is ever a single flat
 * fill. Value transitions are made with `dither`, which interleaves two steps
 * of one ramp on a checkerboard so the eye reads a gradient made of pixels.
 */

import type { Ramp, RampStep } from './palette'

export type Ctx2D = CanvasRenderingContext2D

/** One logical pixel block. Coordinates are floored so nothing lands off-grid. */
export function px(ctx: Ctx2D, color: string, x: number, y: number, w = 1, h = 1): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.max(0, Math.floor(w)), Math.max(0, Math.floor(h)))
}

export type DitherPattern = 'checker' | 'coarse' | 'sparse' | 'dense' | 'vstripe' | 'hstripe'

/**
 * Which of the two colours a pixel takes. `checker` is the 50% mix; `sparse`
 * and `dense` are the 25% and 75% mixes, used to step through a ramp in more
 * than one jump without introducing a third colour.
 */
function ditherPicks(pattern: DitherPattern, x: number, y: number): boolean {
  switch (pattern) {
    case 'checker':
      return (x + y) % 2 === 0
    case 'coarse':
      return (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0
    case 'sparse':
      return x % 2 === 0 && y % 2 === 0
    case 'dense':
      return !(x % 2 === 1 && y % 2 === 1)
    case 'vstripe':
      return x % 2 === 0
    case 'hstripe':
      return y % 2 === 0
  }
}

/** Fill a rect by interleaving two colours. The workhorse of every gradient. */
export function dither(
  ctx: Ctx2D,
  a: string,
  b: string,
  x: number,
  y: number,
  w: number,
  h: number,
  pattern: DitherPattern = 'checker',
): void {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + Math.floor(w)
  const y1 = y0 + Math.floor(h)
  for (let py = y0; py < y1; py += 1) {
    // Draw runs rather than single pixels: same result, far fewer fill calls.
    let runStart = x0
    let runColor = ditherPicks(pattern, x0, py) ? a : b
    for (let pxx = x0 + 1; pxx <= x1; pxx += 1) {
      const color = pxx < x1 ? (ditherPicks(pattern, pxx, py) ? a : b) : null
      if (color !== runColor) {
        px(ctx, runColor, runStart, py, pxx - runStart, 1)
        runStart = pxx
        if (color !== null) runColor = color
      }
    }
  }
}

/**
 * A vertical value gradient across a ramp, banded with dithered transitions.
 *
 * `from`/`to` name the ramp steps at the top and bottom. Each band is a flat
 * run of one step with a dithered seam into the next, which is the standard
 * way pixel art fakes a smooth gradient in four colours.
 */
export function rampGradientV(
  ctx: Ctx2D,
  ramp: Ramp,
  from: RampStep,
  to: RampStep,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const order: RampStep[] = ['dark', 'base', 'light', 'highlight']
  const start = order.indexOf(from)
  const end = order.indexOf(to)
  const steps: RampStep[] = []
  const dir = end >= start ? 1 : -1
  for (let i = start; dir > 0 ? i <= end : i >= end; i += dir) steps.push(order[i]!)
  if (steps.length === 1) {
    px(ctx, ramp[steps[0]!], x, y, w, h)
    return
  }

  const bandH = h / steps.length
  const seam = Math.max(1, Math.min(3, Math.floor(bandH / 3)))
  for (let i = 0; i < steps.length; i += 1) {
    const top = Math.floor(y + bandH * i)
    const bottom = Math.floor(y + bandH * (i + 1))
    px(ctx, ramp[steps[i]!], x, top, w, bottom - top)
    if (i + 1 < steps.length) {
      dither(ctx, ramp[steps[i]!], ramp[steps[i + 1]!], x, bottom - seam, w, seam * 2, 'checker')
    }
  }
}

/** A one-pixel outline in a single colour. Sprites read better with one. */
export function outline(ctx: Ctx2D, color: string, x: number, y: number, w: number, h: number): void {
  px(ctx, color, x, y, w, 1)
  px(ctx, color, x, y + h - 1, w, 1)
  px(ctx, color, x, y, 1, h)
  px(ctx, color, x + w - 1, y, 1, h)
}

/**
 * A rectangular plane with its top edge caught by the light and its bottom
 * dithered into shadow. This is the shape every wall, roof and box uses.
 */
export function plane(
  ctx: Ctx2D,
  ramp: Ramp,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { topLight?: boolean; bottomShade?: boolean; texture?: DitherPattern } = {},
): void {
  const { topLight = true, bottomShade = true, texture } = opts
  px(ctx, ramp.base, x, y, w, h)
  if (texture) dither(ctx, ramp.base, ramp.light, x, y, w, h, texture)
  if (topLight && h > 2) {
    px(ctx, ramp.light, x, y, w, 1)
    if (h > 5) dither(ctx, ramp.light, ramp.base, x, y + 1, w, 2, 'checker')
  }
  if (bottomShade && h > 3) {
    const shadeH = Math.max(1, Math.floor(h / 4))
    dither(ctx, ramp.base, ramp.dark, x, y + h - shadeH - 1, w, shadeH, 'checker')
    px(ctx, ramp.dark, x, y + h - 1, w, 1)
  }
}

/** Scatter small marks deterministically. Used for grass tufts and gravel. */
export function scatter(
  ctx: Ctx2D,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
  density: number,
  seed: number,
): void {
  let state = (seed | 0) || 1
  const count = Math.max(1, Math.floor((w * h) / Math.max(1, density)))
  for (let i = 0; i < count; i += 1) {
    // xorshift keeps this deterministic for a given seed, so frames match.
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    const r = Math.abs(state)
    px(ctx, color, x + (r % Math.floor(w)), y + (Math.floor(r / 7) % Math.floor(h)), 1, 1)
  }
}

/**
 * A cast shadow: a dithered parallelogram, so it sits on the ground plane
 * without the muddy look of a translucent blur.
 */
export function castShadow(
  ctx: Ctx2D,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
): void {
  for (let row = 0; row < h; row += 1) {
    const shift = Math.round((dx * row * w) / Math.max(1, h) * 0.5)
    const inset = Math.round((row / Math.max(1, h)) * (w * 0.18))
    px(ctx, color, x + shift + inset, y + row, Math.max(1, w - inset * 2), 1)
  }
}

/** An offscreen canvas at 1:1 logical pixels, ready for sprite baking. */
export function createSurface(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx2D } {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(w))
  canvas.height = Math.max(1, Math.floor(h))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas context unavailable')
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

/**
 * Tiny 5x7 bitmap font.
 *
 * Canvas text at a non-integer scale is the fastest way to break the pixel
 * illusion, so in-world labels are drawn from glyph bitmaps instead. Anything
 * that needs real typography lives in the DOM HUD, not on the canvas.
 */
const GLYPHS: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10011', '01111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  "'": ['01100', '01100', '01000', '00000', '00000', '00000', '00000'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
}

export const GLYPH_W = 5
export const GLYPH_H = 7

export function textWidth(text: string, tracking = 1): number {
  return text.length * (GLYPH_W + tracking) - tracking
}

/** Draw bitmap text. Unmapped characters are dropped rather than boxed. */
export function bitmapText(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  color: string,
  opts: { tracking?: number; shadow?: string } = {},
): void {
  const { tracking = 1, shadow } = opts
  let cursor = Math.floor(x)
  for (const raw of text.toUpperCase()) {
    const glyph = GLYPHS[raw]
    if (!glyph) {
      cursor += GLYPH_W + tracking
      continue
    }
    for (let row = 0; row < GLYPH_H; row += 1) {
      const bits = glyph[row]!
      for (let col = 0; col < GLYPH_W; col += 1) {
        if (bits[col] !== '1') continue
        if (shadow) px(ctx, shadow, cursor + col, Math.floor(y) + row + 1, 1, 1)
        px(ctx, color, cursor + col, Math.floor(y) + row, 1, 1)
      }
    }
    cursor += GLYPH_W + tracking
  }
}
