/**
 * Street furniture, planting and the small houses of the `patient` scope.
 *
 * Props are what stop a town looking like a diagram of a town, so each one gets
 * the same treatment as a building: a lit side, a shaded side, and a dithered
 * transition rather than an outline around a flat shape.
 */

import { INK, PALETTE, hashIndex, type Ramp } from './palette'
import { bitmapText, dither, px, scatter, textWidth, type Ctx2D } from './pixel'
import type { Rect } from './layout'

export type PropKind =
  | 'broadleaf'
  | 'pine'
  | 'bush'
  | 'hedge'
  | 'lamp'
  | 'bench'
  | 'planter'
  | 'bin'
  | 'postbox'
  | 'van'

export interface PropPlacement {
  kind: PropKind
  x: number
  y: number
  /** Seeds crown shape and foliage scatter. Deterministic, never random. */
  seed: string
}

/**
 * A broadleaf tree. The crown is built from three overlapping lobes in three
 * values, with the light catching the upper left, so it has volume instead of
 * being a green blob.
 */
function drawBroadleaf(ctx: Ctx2D, x: number, y: number, seed: string): void {
  const variant = hashIndex(seed, 3)
  const w = 26 + variant * 2
  const crownH = 24 + variant * 2
  const g = PALETTE.grass

  // Trunk with bark grain and a root flare.
  px(ctx, PALETTE.wood.dark, x + 10, y + crownH - 4, 6, 14)
  px(ctx, PALETTE.wood.base, x + 11, y + crownH - 4, 4, 14)
  px(ctx, PALETTE.wood.light, x + 11, y + crownH - 4, 1, 14)
  dither(ctx, PALETTE.wood.base, PALETTE.wood.dark, x + 12, y + crownH - 2, 3, 10, 'hstripe')
  px(ctx, PALETTE.wood.dark, x + 9, y + crownH + 9, 8, 1)

  // Crown lobes, back to front.
  px(ctx, g.dark, x + 2, y + 6, w - 4, crownH - 8)
  px(ctx, g.dark, x + 6, y + 2, w - 12, crownH - 4)
  dither(ctx, g.dark, g.base, x + 2, y + 4, w - 4, crownH - 6, 'coarse')
  px(ctx, g.base, x + 4, y + 6, w - 12, crownH - 12)
  dither(ctx, g.base, g.light, x + 4, y + 5, w - 14, crownH - 14, 'checker')
  px(ctx, g.light, x + 6, y + 5, 8, 6)
  px(ctx, g.highlight, x + 7, y + 5, 4, 2)
  scatter(ctx, g.highlight, x + 4, y + 4, w - 8, crownH - 10, 26, seed.length + 7)
  scatter(ctx, g.dark, x + 3, y + 8, w - 6, crownH - 12, 22, seed.length + 13)

  // Ground contact.
  dither(ctx, PALETTE.grass.dark, INK, x + 7, y + crownH + 9, 12, 2, 'checker')
}

function drawPine(ctx: Ctx2D, x: number, y: number, seed: string): void {
  const tiers = 3 + (hashIndex(seed, 2) === 0 ? 1 : 0)
  const g = { dark: '#173d24', base: '#1f5230', light: '#2d6b3c', highlight: '#488b50' }

  px(ctx, PALETTE.wood.dark, x + 9, y + 8 + tiers * 8, 4, 10)
  px(ctx, PALETTE.wood.base, x + 10, y + 8 + tiers * 8, 2, 10)

  for (let tier = tiers - 1; tier >= 0; tier -= 1) {
    const spread = 6 + tier * 5
    const cy = y + 6 + tier * 8
    px(ctx, g.dark, x + 11 - spread, cy, spread * 2, 9)
    dither(ctx, g.dark, g.base, x + 11 - spread, cy, spread * 2, 8, 'coarse')
    px(ctx, g.base, x + 11 - spread + 2, cy, spread * 2 - 6, 5)
    px(ctx, g.light, x + 11 - spread + 3, cy, Math.max(2, spread - 2), 2)
    px(ctx, g.highlight, x + 11 - spread + 4, cy, 3, 1)
  }
  px(ctx, g.light, x + 10, y, 2, 7)
  px(ctx, g.highlight, x + 10, y, 1, 3)
  dither(ctx, PALETTE.grass.dark, INK, x + 6, y + 17 + tiers * 8, 10, 2, 'checker')
}

function drawBush(ctx: Ctx2D, x: number, y: number, seed: string): void {
  const w = 16 + hashIndex(seed, 3) * 3
  const g = PALETTE.grass
  px(ctx, g.dark, x, y + 3, w, 9)
  px(ctx, g.base, x + 1, y + 1, w - 2, 8)
  dither(ctx, g.base, g.light, x + 1, y + 1, w - 2, 6, 'checker')
  px(ctx, g.light, x + 3, y + 1, Math.floor(w / 2), 3)
  px(ctx, g.highlight, x + 4, y + 1, 3, 1)
  scatter(ctx, PALETTE.amber.light, x + 2, y + 2, w - 4, 7, 40, seed.length + 3)
  dither(ctx, g.dark, INK, x + 2, y + 11, w - 4, 1, 'checker')
}

/** A run of hedge, used to fence the park and the gardens. */
export function drawHedge(ctx: Ctx2D, rect: Rect, seed: string): void {
  const g = PALETTE.grass
  px(ctx, g.dark, rect.x, rect.y, rect.w, rect.h)
  dither(ctx, g.dark, g.base, rect.x, rect.y, rect.w, rect.h, 'coarse')
  px(ctx, g.base, rect.x, rect.y, rect.w, Math.max(2, rect.h - 4))
  dither(ctx, g.base, g.light, rect.x, rect.y, rect.w, 4, 'checker')
  px(ctx, g.light, rect.x, rect.y, rect.w, 1)
  for (let i = 0; i < rect.w; i += 7) {
    px(ctx, g.highlight, rect.x + i + hashIndex(seed + i, 3), rect.y, 2, 1)
  }
  scatter(ctx, g.dark, rect.x, rect.y + 2, rect.w, Math.max(1, rect.h - 2), 18, seed.length + 11)
}

/** Street lamp. The glow is drawn at render time, because it depends on hour. */
function drawLamp(ctx: Ctx2D, x: number, y: number): void {
  px(ctx, PALETTE.steel.dark, x + 3, y + 6, 3, 26)
  px(ctx, PALETTE.steel.base, x + 4, y + 6, 1, 26)
  px(ctx, PALETTE.steel.light, x + 4, y + 6, 1, 12)
  px(ctx, PALETTE.steel.dark, x + 1, y + 31, 7, 2)
  px(ctx, PALETTE.steel.base, x + 3, y + 3, 6, 2)
  px(ctx, PALETTE.steel.dark, x + 7, y + 5, 3, 2)
  px(ctx, PALETTE.lamp.dark, x + 7, y + 6, 3, 3)
}

function drawBench(ctx: Ctx2D, x: number, y: number): void {
  px(ctx, PALETTE.wood.dark, x, y + 4, 22, 3)
  px(ctx, PALETTE.wood.base, x, y + 4, 22, 2)
  px(ctx, PALETTE.wood.light, x, y + 4, 22, 1)
  px(ctx, PALETTE.wood.base, x + 1, y, 20, 3)
  px(ctx, PALETTE.wood.light, x + 1, y, 20, 1)
  dither(ctx, PALETTE.wood.base, PALETTE.wood.dark, x + 1, y + 2, 20, 1, 'vstripe')
  px(ctx, PALETTE.steel.dark, x + 2, y + 7, 2, 5)
  px(ctx, PALETTE.steel.dark, x + 18, y + 7, 2, 5)
  dither(ctx, PALETTE.grass.dark, INK, x + 1, y + 12, 20, 1, 'checker')
}

function drawPlanter(ctx: Ctx2D, x: number, y: number, seed: string): void {
  px(ctx, PALETTE.brick.base, x, y + 6, 18, 9)
  dither(ctx, PALETTE.brick.base, PALETTE.brick.dark, x, y + 6, 18, 9, 'coarse')
  px(ctx, PALETTE.brick.light, x, y + 6, 18, 1)
  px(ctx, INK, x, y + 14, 18, 1)
  px(ctx, PALETTE.grass.base, x + 2, y + 2, 14, 5)
  dither(ctx, PALETTE.grass.base, PALETTE.grass.light, x + 2, y + 2, 14, 4, 'checker')
  scatter(ctx, PALETTE.alarm.light, x + 3, y + 2, 12, 4, 12, seed.length + 5)
  scatter(ctx, PALETTE.lamp.highlight, x + 3, y + 2, 12, 4, 16, seed.length + 9)
}

function drawBin(ctx: Ctx2D, x: number, y: number): void {
  px(ctx, PALETTE.steel.dark, x, y + 2, 10, 13)
  px(ctx, PALETTE.steel.base, x + 1, y + 2, 7, 13)
  px(ctx, PALETTE.steel.light, x + 1, y + 2, 2, 13)
  dither(ctx, PALETTE.steel.base, PALETTE.steel.dark, x + 4, y + 4, 4, 10, 'checker')
  px(ctx, PALETTE.slate.light, x - 1, y, 12, 3)
  px(ctx, PALETTE.slate.highlight, x - 1, y, 12, 1)
}

function drawPostbox(ctx: Ctx2D, x: number, y: number): void {
  px(ctx, PALETTE.alarm.dark, x, y + 2, 12, 20)
  px(ctx, PALETTE.alarm.base, x + 1, y + 2, 9, 20)
  px(ctx, PALETTE.alarm.light, x + 1, y + 2, 3, 20)
  px(ctx, PALETTE.alarm.highlight, x + 1, y + 2, 1, 12)
  px(ctx, PALETTE.alarm.dark, x, y, 12, 3)
  px(ctx, PALETTE.alarm.light, x, y, 12, 1)
  px(ctx, INK, x + 3, y + 7, 6, 2)
  dither(ctx, PALETTE.paving.dark, INK, x, y + 21, 12, 1, 'checker')
}

/** A courier van parked at the kerb. */
function drawVan(ctx: Ctx2D, x: number, y: number): void {
  px(ctx, PALETTE.coat.base, x, y + 4, 38, 14)
  px(ctx, PALETTE.coat.light, x, y + 4, 38, 3)
  px(ctx, PALETTE.coat.highlight, x, y + 4, 38, 1)
  dither(ctx, PALETTE.coat.base, PALETTE.coat.dark, x, y + 13, 38, 5, 'checker')
  px(ctx, PALETTE.coat.dark, x, y + 4, 1, 14)
  px(ctx, INK, x, y + 17, 38, 1)
  px(ctx, PALETTE.glass.base, x + 27, y + 6, 9, 6)
  px(ctx, PALETTE.glass.light, x + 27, y + 6, 9, 2)
  px(ctx, PALETTE.hiVis.base, x + 2, y + 10, 22, 3)
  px(ctx, PALETTE.hiVis.highlight, x + 2, y + 10, 22, 1)
  px(ctx, INK, x + 5, y + 18, 7, 4)
  px(ctx, INK, x + 26, y + 18, 7, 4)
  px(ctx, PALETTE.steel.light, x + 7, y + 19, 3, 2)
  px(ctx, PALETTE.steel.light, x + 28, y + 19, 3, 2)
}

export function drawProp(ctx: Ctx2D, prop: PropPlacement): void {
  switch (prop.kind) {
    case 'broadleaf':
      return drawBroadleaf(ctx, prop.x, prop.y, prop.seed)
    case 'pine':
      return drawPine(ctx, prop.x, prop.y, prop.seed)
    case 'bush':
      return drawBush(ctx, prop.x, prop.y, prop.seed)
    case 'hedge':
      return drawHedge(ctx, { x: prop.x, y: prop.y, w: 40, h: 10 }, prop.seed)
    case 'lamp':
      return drawLamp(ctx, prop.x, prop.y)
    case 'bench':
      return drawBench(ctx, prop.x, prop.y)
    case 'planter':
      return drawPlanter(ctx, prop.x, prop.y, prop.seed)
    case 'bin':
      return drawBin(ctx, prop.x, prop.y)
    case 'postbox':
      return drawPostbox(ctx, prop.x, prop.y)
    case 'van':
      return drawVan(ctx, prop.x, prop.y)
  }
}

/** Lamp head position, for the render-time glow. */
export function lampHead(prop: PropPlacement): { x: number; y: number } {
  return { x: prop.x + 8, y: prop.y + 7 }
}

/**
 * A terraced house in the `patient` scope.
 *
 * Deliberately smaller and warmer than the seven service buildings: homes are
 * where the work lands, and they should not compete with the catalogue sites.
 */
export function drawHome(
  ctx: Ctx2D,
  rect: Rect,
  seed: string,
  lit: boolean,
  onLitPane?: (pane: Rect) => void,
): void {
  const variant = hashIndex(seed, 3)
  const wallRamps: Ramp[] = [PALETTE.brick, PALETTE.plaster, PALETTE.kerb]
  const wall = wallRamps[variant]!
  const roofRamps: Ramp[] = [PALETTE.slate, PALETTE.wood, PALETTE.brick]
  const roof = roofRamps[(variant + 1) % 3]!
  const roofH = 16

  // Gabled roof.
  for (let row = 0; row < roofH; row += 1) {
    const t = row / (roofH - 1)
    const inset = Math.round((1 - t) * (rect.w / 2 - 3))
    const x = rect.x - 3 + inset
    const w = rect.w + 6 - inset * 2
    const y = rect.y - roofH + row
    px(ctx, t < 0.4 ? roof.light : t < 0.75 ? roof.base : roof.dark, x, y, w, 1)
    if (row % 3 === 2) px(ctx, roof.dark, x, y, w, 1)
    px(ctx, INK, x, y, 1, 1)
    px(ctx, INK, x + w - 1, y, 1, 1)
  }
  px(ctx, roof.highlight, rect.x + Math.floor(rect.w / 2) - 3, rect.y - roofH, 6, 1)
  px(ctx, PALETTE.brick.base, rect.x + rect.w - 14, rect.y - roofH - 6, 6, 8)
  px(ctx, PALETTE.brick.light, rect.x + rect.w - 14, rect.y - roofH - 6, 6, 1)

  // Wall: one lit plane, one shaded plane, and a 25% speckle for material.
  // A 50% checker across the whole wall reads as a chequered tablecloth, so the
  // texture stays sparse and only steps one rung of the ramp.
  px(ctx, wall.base, rect.x, rect.y, rect.w, rect.h)
  dither(ctx, wall.base, wall.light, rect.x, rect.y, rect.w, rect.h, 'sparse')
  px(ctx, wall.light, rect.x, rect.y, 2, rect.h)
  px(ctx, wall.light, rect.x, rect.y, rect.w, 1)
  dither(ctx, wall.base, wall.dark, rect.x + rect.w - 7, rect.y, 7, rect.h, 'sparse')
  px(ctx, wall.dark, rect.x + rect.w - 2, rect.y, 2, rect.h)
  // Eaves shadow, the cue that the roof overhangs the wall.
  dither(ctx, wall.dark, wall.base, rect.x, rect.y, rect.w, 3, 'checker')
  if (wall === PALETTE.brick) {
    for (let by = rect.y + 4; by < rect.y + rect.h - 1; by += 4) {
      px(ctx, wall.dark, rect.x, by, rect.w, 1)
    }
  }
  px(ctx, INK, rect.x, rect.y, 1, rect.h)
  px(ctx, INK, rect.x + rect.w - 1, rect.y, 1, rect.h)
  px(ctx, INK, rect.x, rect.y + rect.h - 1, rect.w, 1)

  // One window, one door, a step and a gate post.
  const glass = lit ? PALETTE.glassLit : PALETTE.glass
  const wx = rect.x + 6
  const wy = rect.y + 10
  px(ctx, INK, wx, wy, 14, 12)
  px(ctx, glass.base, wx + 1, wy + 1, 12, 10)
  px(ctx, glass.light, wx + 1, wy + 1, 12, 4)
  if (lit) {
    px(ctx, glass.highlight, wx + 2, wy + 6, 10, 4)
    onLitPane?.({ x: wx + 1, y: wy + 1, w: 12, h: 10 })
  } else {
    dither(ctx, glass.base, glass.dark, wx + 1, wy + 6, 12, 5, 'checker')
  }
  px(ctx, PALETTE.coat.light, wx + 6, wy + 1, 1, 10)
  px(ctx, PALETTE.coat.light, wx + 1, wy + 5, 12, 1)
  px(ctx, PALETTE.plaster.highlight, wx - 1, wy + 12, 16, 2)

  const dx = rect.x + rect.w - 20
  const dy = rect.y + rect.h - 20
  px(ctx, INK, dx - 1, dy - 1, 14, 20)
  px(ctx, PALETTE.wood.base, dx, dy, 12, 19)
  dither(ctx, PALETTE.wood.base, PALETTE.wood.dark, dx, dy, 12, 19, 'vstripe')
  px(ctx, PALETTE.wood.light, dx, dy, 12, 1)
  px(ctx, PALETTE.lamp.light, dx + 9, dy + 9, 2, 2)
  px(ctx, PALETTE.paving.light, dx - 3, dy + 19, 18, 2)
}

/**
 * A signpost for a non-site scope.
 *
 * These carry real scope strings out of event `visibleTo` arrays — `ambulance`,
 * `triage`, `icb` and so on. They are not catalogue sites, so they are signed
 * edges of the map rather than buildings, and the label is the scope id itself.
 */
export function drawSignpost(ctx: Ctx2D, x: number, y: number, label: string, facing: string): void {
  const boardW = textWidth(label) + 10
  const boardH = 13
  const bx = x - Math.floor(boardW / 2)
  const by = y - 34

  px(ctx, PALETTE.wood.dark, x - 2, by + boardH, 4, 22)
  px(ctx, PALETTE.wood.base, x - 1, by + boardH, 2, 22)
  px(ctx, PALETTE.wood.light, x - 1, by + boardH, 1, 12)
  dither(ctx, PALETTE.paving.dark, INK, x - 5, by + boardH + 21, 10, 2, 'checker')

  px(ctx, INK, bx - 1, by - 1, boardW + 2, boardH + 2)
  px(ctx, PALETTE.kerb.base, bx, by, boardW, boardH)
  dither(ctx, PALETTE.kerb.base, PALETTE.kerb.light, bx, by, boardW, boardH, 'checker')
  px(ctx, PALETTE.kerb.highlight, bx, by, boardW, 1)
  px(ctx, PALETTE.kerb.dark, bx, by + boardH - 1, boardW, 1)
  bitmapText(ctx, label, bx + 5, by + 3, INK)

  // A chevron pointing into the neighbourhood.
  const cx = facing === 'east' ? bx + boardW : bx - 3
  const dir = facing === 'east' ? 1 : -1
  for (let i = 0; i < 3; i += 1) {
    px(ctx, PALETTE.kerb.dark, cx + dir * i, by + 3 + i, 1, boardH - 6 - i * 2)
  }
}
