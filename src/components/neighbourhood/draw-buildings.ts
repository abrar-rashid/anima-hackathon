/**
 * Buildings.
 *
 * Every building is built from the same parts so the seven read as one town:
 * a roof plane carrying the site's catalogue colour, a facade plane in the
 * shared plaster ramp at a different value, a brick plinth, glazed windows that
 * are lit or dark, and a door with a canopy. The roof is a separate value range
 * from the facade, which is what makes the form read as three-dimensional
 * instead of as a coloured rectangle.
 *
 * Nothing here is a flat fill: tile courses, plaster banding and the plinth are
 * all dithered between two steps of one ramp.
 */

import { INK, PALETTE, hashIndex, type Ramp } from './palette'
import { bitmapText, dither, px, rampGradientV, textWidth, type Ctx2D } from './pixel'
import type { Plot, Rect } from './layout'

export interface BuildingStyle {
  /** Derived from the catalogue colour for this site. */
  roof: Ramp
  /** True at dusk, night and dawn. */
  lit: boolean
  /** Drawn on the sign board. Empty when no source supplied a name. */
  signLines: string[]
  /** Always drawn, small, under the name: the real site id. */
  siteId: string
  /** Seeds the deterministic details, so a building never changes between frames. */
  seed: string
  /**
   * Called with each lit pane. The night wash is laid over the whole world
   * after the structures layer, so a lit window baked underneath it comes out
   * grey. Collecting the panes lets the renderer put the glow back on top.
   */
  onLitPane?: (rect: Rect) => void
}

const OVERHANG = 5

function roofHeight(plot: Plot): number {
  return 18 + plot.storeys * 4
}

/** Hipped roof: a trapezoid narrowing toward the ridge, with tile courses. */
function drawPitchedRoof(ctx: Ctx2D, plot: Plot, style: BuildingStyle): void {
  const { rect } = plot
  const h = roofHeight(plot)
  const top = rect.y - h
  const narrow = Math.floor(rect.w * 0.22)

  for (let row = 0; row < h; row += 1) {
    const t = row / (h - 1)
    const inset = Math.round((1 - t) * narrow)
    const x = rect.x - OVERHANG + inset
    const w = rect.w + OVERHANG * 2 - inset * 2
    const y = top + row

    // Value falls from ridge to eaves, with a dithered seam between bands.
    const band = t < 0.28 ? style.roof.light : t < 0.62 ? style.roof.base : style.roof.dark
    px(ctx, band, x, y, w, 1)
    if (t >= 0.24 && t < 0.32) dither(ctx, style.roof.light, style.roof.base, x, y, w, 1, 'checker')
    if (t >= 0.58 && t < 0.66) dither(ctx, style.roof.base, style.roof.dark, x, y, w, 1, 'checker')

    // Tile courses every four rows, offset alternately like real tiling.
    if (row % 4 === 3) {
      px(ctx, style.roof.dark, x, y, w, 1)
      const offset = (row / 4) % 2 === 0 ? 0 : 3
      for (let tx = x + offset; tx < x + w; tx += 6) px(ctx, style.roof.dark, tx, y - 1, 1, 1)
    }
    px(ctx, INK, x, y, 1, 1)
    px(ctx, INK, x + w - 1, y, 1, 1)
  }

  // Ridge cap and gutter.
  const ridgeW = rect.w + OVERHANG * 2 - narrow * 2
  px(ctx, style.roof.highlight, rect.x - OVERHANG + narrow, top, ridgeW, 1)
  px(ctx, style.roof.light, rect.x - OVERHANG + narrow, top + 1, ridgeW, 1)
  px(ctx, PALETTE.steel.dark, rect.x - OVERHANG, rect.y - 2, rect.w + OVERHANG * 2, 2)
  px(ctx, PALETTE.steel.base, rect.x - OVERHANG, rect.y - 2, rect.w + OVERHANG * 2, 1)
}

/** Flat roof with a parapet: labs and office blocks. */
function drawFlatRoof(ctx: Ctx2D, plot: Plot, style: BuildingStyle): void {
  const { rect } = plot
  const h = Math.floor(roofHeight(plot) * 0.6)
  const top = rect.y - h

  // Parapet band, then the deck receding behind it.
  px(ctx, style.roof.base, rect.x - OVERHANG, top, rect.w + OVERHANG * 2, h)
  dither(ctx, style.roof.base, style.roof.dark, rect.x - OVERHANG, top + h - 6, rect.w + OVERHANG * 2, 6, 'checker')
  px(ctx, style.roof.light, rect.x - OVERHANG, top, rect.w + OVERHANG * 2, 2)
  px(ctx, style.roof.highlight, rect.x - OVERHANG, top, rect.w + OVERHANG * 2, 1)
  px(ctx, INK, rect.x - OVERHANG, top, 1, h)
  px(ctx, INK, rect.x + rect.w + OVERHANG - 1, top, 1, h)

  // Plant deck: two units and a vent stack, so the silhouette is not a slab.
  const deckY = top + 3
  px(ctx, PALETTE.steel.base, rect.x + 16, deckY - 8, 22, 10)
  px(ctx, PALETTE.steel.light, rect.x + 16, deckY - 8, 22, 2)
  dither(ctx, PALETTE.steel.base, PALETTE.steel.dark, rect.x + 16, deckY - 3, 22, 4, 'vstripe')
  px(ctx, INK, rect.x + 16, deckY - 8, 1, 10)

  px(ctx, PALETTE.steel.base, rect.x + rect.w - 44, deckY - 6, 16, 8)
  px(ctx, PALETTE.steel.light, rect.x + rect.w - 44, deckY - 6, 16, 2)
  px(ctx, PALETTE.steel.dark, rect.x + rect.w - 40, deckY - 12, 3, 7)
  px(ctx, PALETTE.steel.light, rect.x + rect.w - 40, deckY - 12, 1, 7)
}

function drawChimney(ctx: Ctx2D, x: number, y: number, h: number): void {
  px(ctx, PALETTE.brick.base, x, y, 9, h)
  dither(ctx, PALETTE.brick.base, PALETTE.brick.dark, x, y, 9, h, 'coarse')
  px(ctx, PALETTE.brick.light, x, y, 9, 1)
  px(ctx, PALETTE.slate.base, x - 1, y - 3, 11, 3)
  px(ctx, PALETTE.slate.light, x - 1, y - 3, 11, 1)
  px(ctx, INK, x - 1, y - 3, 1, 3)
  px(ctx, INK, x + 9, y - 3, 1, 3)
}

function drawAntenna(ctx: Ctx2D, x: number, y: number): void {
  px(ctx, PALETTE.steel.base, x, y, 1, 18)
  px(ctx, PALETTE.steel.light, x, y, 1, 8)
  for (let i = 0; i < 3; i += 1) {
    px(ctx, PALETTE.steel.light, x - 3 + i, y + 4 + i * 4, 7 - i * 2, 1)
  }
  px(ctx, PALETTE.alarm.highlight, x, y - 2, 1, 2)
}

/** Facade: plaster with a brick plinth, quoined corners and storey banding. */
function drawFacade(ctx: Ctx2D, plot: Plot, _style: BuildingStyle): void {
  const { rect } = plot
  const plinthH = 10

  rampGradientV(ctx, PALETTE.plaster, 'light', 'base', rect.x, rect.y, rect.w, rect.h - plinthH)
  dither(ctx, PALETTE.plaster.light, PALETTE.plaster.base, rect.x, rect.y, rect.w, rect.h - plinthH, 'sparse')

  // Eaves shadow cast down the wall: the cue that the roof overhangs.
  dither(ctx, PALETTE.plaster.dark, PALETTE.plaster.base, rect.x, rect.y, rect.w, 5, 'checker')
  px(ctx, PALETTE.plaster.dark, rect.x, rect.y, rect.w, 1)

  // Brick plinth.
  const plinthY = rect.y + rect.h - plinthH
  px(ctx, PALETTE.brick.base, rect.x, plinthY, rect.w, plinthH)
  dither(ctx, PALETTE.brick.base, PALETTE.brick.dark, rect.x, plinthY, rect.w, plinthH, 'coarse')
  px(ctx, PALETTE.brick.light, rect.x, plinthY, rect.w, 1)
  for (let by = plinthY + 3; by < plinthY + plinthH; by += 3) {
    px(ctx, PALETTE.brick.dark, rect.x, by, rect.w, 1)
  }

  // Quoined corners, two values so the edge turns rather than stops.
  px(ctx, PALETTE.plaster.highlight, rect.x, rect.y, 2, rect.h - plinthH)
  px(ctx, PALETTE.plaster.dark, rect.x + rect.w - 2, rect.y, 2, rect.h - plinthH)

  // Storey bands.
  for (let s = 1; s < plot.storeys; s += 1) {
    const y = rect.y + Math.round(((rect.h - plinthH) * s) / plot.storeys)
    px(ctx, PALETTE.plaster.dark, rect.x, y, rect.w, 1)
    dither(ctx, PALETTE.plaster.highlight, PALETTE.plaster.light, rect.x, y + 1, rect.w, 1, 'checker')
  }

  px(ctx, INK, rect.x, rect.y, 1, rect.h)
  px(ctx, INK, rect.x + rect.w - 1, rect.y, 1, rect.h)
  px(ctx, INK, rect.x, rect.y + rect.h - 1, rect.w, 1)
}

const WIN_W = 11
const WIN_H = 13

function drawWindow(ctx: Ctx2D, x: number, y: number, lit: boolean, blind: boolean): void {
  // Reveal and lintel.
  px(ctx, PALETTE.plaster.dark, x - 1, y - 1, WIN_W + 2, WIN_H + 2)
  px(ctx, PALETTE.brick.dark, x - 1, y - 2, WIN_W + 2, 2)
  px(ctx, INK, x, y, WIN_W, WIN_H)

  const glass = lit ? PALETTE.glassLit : PALETTE.glass
  px(ctx, glass.base, x + 1, y + 1, WIN_W - 2, WIN_H - 2)

  if (lit) {
    // Warm interior, brightest at the bottom where a desk lamp would sit.
    dither(ctx, glass.light, glass.base, x + 1, y + 1, WIN_W - 2, WIN_H - 2, 'checker')
    px(ctx, glass.highlight, x + 2, y + WIN_H - 5, WIN_W - 4, 3)
    dither(ctx, glass.highlight, glass.light, x + 1, y + WIN_H - 7, WIN_W - 2, 2, 'checker')
  } else {
    // Sky reflection down the top-left, shadow bottom-right.
    px(ctx, glass.light, x + 1, y + 1, WIN_W - 3, 4)
    dither(ctx, glass.light, glass.base, x + 1, y + 4, WIN_W - 2, 3, 'checker')
    dither(ctx, glass.base, glass.dark, x + 1, y + WIN_H - 5, WIN_W - 2, 4, 'checker')
    px(ctx, glass.highlight, x + 1, y + 1, 3, 1)
  }

  if (blind) {
    // A half-drawn blind, which stops a wall of windows looking stencilled.
    px(ctx, PALETTE.paper.light, x + 1, y + 1, WIN_W - 2, 4)
    dither(ctx, PALETTE.paper.light, PALETTE.paper.dark, x + 1, y + 4, WIN_W - 2, 1, 'vstripe')
  }

  // Mullions and sill.
  px(ctx, PALETTE.slate.light, x + Math.floor(WIN_W / 2), y + 1, 1, WIN_H - 2)
  px(ctx, PALETTE.slate.light, x + 1, y + Math.floor(WIN_H / 2), WIN_W - 2, 1)
  px(ctx, PALETTE.plaster.highlight, x - 2, y + WIN_H, WIN_W + 4, 2)
  px(ctx, PALETTE.plaster.dark, x - 2, y + WIN_H + 2, WIN_W + 4, 1)
}

function drawWindows(ctx: Ctx2D, plot: Plot, style: BuildingStyle): void {
  const { rect } = plot
  const usableW = rect.w - 16
  const columns = Math.max(2, Math.floor(usableW / (WIN_W + 9)))
  const gap = (usableW - columns * WIN_W) / Math.max(1, columns - 1)
  const storeyH = (rect.h - 10) / plot.storeys
  const doorColumn = Math.floor(columns / 2)

  for (let row = 0; row < plot.storeys; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      // Ground floor keeps its centre bay clear for the entrance.
      const groundRow = row === plot.storeys - 1
      if (groundRow && col === doorColumn) continue

      const x = Math.round(rect.x + 8 + col * (WIN_W + gap))
      const y = Math.round(rect.y + row * storeyH + (storeyH - WIN_H) / 2 + 3)
      const key = `${style.seed}:${row}:${col}`
      // Roughly two in three windows are lit at night; the pattern is fixed per
      // building so the town does not twinkle randomly between frames.
      const lit = style.lit && hashIndex(key, 3) !== 0
      const blind = !style.lit && hashIndex(`b${key}`, 5) === 0
      drawWindow(ctx, x, y, lit, blind)
      if (lit) style.onLitPane?.({ x: x + 1, y: y + 1, w: WIN_W - 2, h: WIN_H - 2 })
    }
  }
}

function drawDoor(ctx: Ctx2D, plot: Plot, style: BuildingStyle): void {
  const doorW = 18
  const doorH = 26
  const x = plot.door.x - Math.floor(doorW / 2)
  const y = plot.rect.y + plot.rect.h - doorH

  // Canopy in the site colour: the one place the catalogue colour reaches the
  // ground, which ties the roof to the entrance.
  px(ctx, style.roof.base, x - 7, y - 7, doorW + 14, 4)
  px(ctx, style.roof.light, x - 7, y - 7, doorW + 14, 1)
  px(ctx, style.roof.dark, x - 7, y - 3, doorW + 14, 1)
  dither(ctx, PALETTE.plaster.dark, PALETTE.plaster.base, x - 7, y - 2, doorW + 14, 3, 'checker')
  px(ctx, PALETTE.steel.dark, x - 6, y - 3, 1, 5)
  px(ctx, PALETTE.steel.dark, x + doorW + 5, y - 3, 1, 5)

  px(ctx, INK, x - 2, y - 2, doorW + 4, doorH + 2)
  px(ctx, PALETTE.plaster.highlight, x - 1, y - 1, doorW + 2, doorH)

  px(ctx, PALETTE.wood.base, x, y, doorW, doorH - 1)
  dither(ctx, PALETTE.wood.base, PALETTE.wood.dark, x, y, doorW, doorH - 1, 'vstripe')
  px(ctx, PALETTE.wood.light, x, y, doorW, 1)
  // Glazed upper panel, lit from inside when the building is lit.
  const panel = style.lit ? PALETTE.glassLit : PALETTE.glass
  px(ctx, panel.base, x + 3, y + 3, doorW - 6, 8)
  px(ctx, panel.light, x + 3, y + 3, doorW - 6, 3)
  if (style.lit) style.onLitPane?.({ x: x + 3, y: y + 3, w: doorW - 6, h: 8 })
  px(ctx, INK, x + Math.floor(doorW / 2), y + 3, 1, 8)
  px(ctx, PALETTE.steel.highlight, x + doorW - 5, y + 15, 2, 2)

  // Step, with its own cast shadow onto the pavement.
  px(ctx, PALETTE.paving.light, x - 4, y + doorH - 1, doorW + 8, 3)
  dither(ctx, PALETTE.paving.base, PALETTE.paving.dark, x - 4, y + doorH + 1, doorW + 8, 2, 'checker')
}

function drawSign(ctx: Ctx2D, plot: Plot, style: BuildingStyle): void {
  const lines = style.signLines.slice(0, 2)
  const label = lines.length > 0 ? lines : ['']
  const widest = Math.max(textWidth(style.siteId), ...label.map((line) => textWidth(line)))
  const boardW = Math.min(plot.rect.w - 10, widest + 12)
  const boardH = 12 + label.length * 9
  const x = plot.door.x - Math.floor(boardW / 2)
  const y = plot.rect.y + 6

  px(ctx, INK, x - 1, y - 1, boardW + 2, boardH + 2)
  px(ctx, style.roof.dark, x, y, boardW, boardH)
  dither(ctx, style.roof.dark, style.roof.base, x, y, boardW, boardH, 'checker')
  px(ctx, style.roof.light, x, y, boardW, 1)
  px(ctx, style.roof.dark, x, y + boardH - 1, boardW, 1)

  label.forEach((line, index) => {
    const tx = x + Math.floor((boardW - textWidth(line)) / 2)
    bitmapText(ctx, line, tx, y + 3 + index * 9, PALETTE.paper.highlight, { shadow: INK })
  })
  const idX = x + Math.floor((boardW - textWidth(style.siteId)) / 2)
  bitmapText(ctx, style.siteId, idX, y + boardH - 8, style.roof.highlight)
}

/** Pharmacy awning: striped, because a shopfront should read as a shopfront. */
function drawAwning(ctx: Ctx2D, rect: Rect, ramp: Ramp): void {
  const y = rect.y + rect.h - 44
  for (let i = 0; i < rect.w - 8; i += 1) {
    const stripe = Math.floor(i / 6) % 2 === 0
    px(ctx, stripe ? ramp.light : PALETTE.paper.light, rect.x + 4 + i, y, 1, 7)
    px(ctx, stripe ? ramp.base : PALETTE.paper.base, rect.x + 4 + i, y + 5, 1, 3)
  }
  px(ctx, INK, rect.x + 4, y, rect.w - 8, 1)
  // Scalloped hem.
  for (let i = 0; i < rect.w - 8; i += 6) {
    px(ctx, ramp.dark, rect.x + 4 + i + 2, y + 8, 2, 1)
  }
  dither(ctx, PALETTE.plaster.dark, PALETTE.plaster.base, rect.x + 4, y + 9, rect.w - 8, 3, 'checker')
}

/** Ambulance bay outside the hospital: hatched tarmac and a bollard pair. */
function drawBay(ctx: Ctx2D, rect: Rect): void {
  const y = rect.y + rect.h
  px(ctx, PALETTE.paving.base, rect.x - 26, y, 22, 30)
  dither(ctx, PALETTE.paving.base, PALETTE.paving.dark, rect.x - 26, y, 22, 30, 'coarse')
  for (let i = 0; i < 30; i += 5) {
    px(ctx, PALETTE.hiVis.light, rect.x - 26 + (i % 10), y + i, 10, 1)
  }
  px(ctx, PALETTE.steel.base, rect.x - 6, y + 6, 2, 9)
  px(ctx, PALETTE.hiVis.light, rect.x - 6, y + 6, 2, 2)
}

export function drawBuilding(ctx: Ctx2D, plot: Plot, style: BuildingStyle): void {
  if (plot.shape === 'lab' || plot.shape === 'block') {
    drawFlatRoof(ctx, plot, style)
  } else {
    drawPitchedRoof(ctx, plot, style)
    drawChimney(ctx, plot.rect.x + 18, plot.rect.y - roofHeight(plot) + 4, roofHeight(plot) - 2)
    if (plot.shape === 'civic') {
      drawChimney(ctx, plot.rect.x + plot.rect.w - 27, plot.rect.y - roofHeight(plot) + 8, roofHeight(plot) - 6)
    }
  }

  if (plot.shape === 'lab') {
    drawAntenna(ctx, plot.rect.x + plot.rect.w - 14, plot.rect.y - roofHeight(plot))
  }

  drawFacade(ctx, plot, style)
  drawWindows(ctx, plot, style)
  if (plot.shape === 'house') drawAwning(ctx, plot.rect, style.roof)
  if (plot.shape === 'civic' && plot.rect.w > 175) drawBay(ctx, plot.rect)
  drawDoor(ctx, plot, style)
  drawSign(ctx, plot, style)
}

/**
 * The building's cast shadow on the ground, as a dithered parallelogram
 * skewed by the sun vector. Long at dawn and dusk, short at noon.
 */
export function drawBuildingShadow(
  ctx: Ctx2D,
  plot: Plot,
  sun: { dx: number; dy: number; length: number },
  color: string,
  ground: string,
): void {
  const { rect } = plot
  const depth = Math.round(10 * sun.length * sun.dy)
  const reach = Math.round(rect.h * 0.5 * sun.length * sun.dx)
  for (let row = 0; row < depth; row += 1) {
    const t = row / Math.max(1, depth)
    const shift = Math.round(reach * t)
    const inset = Math.round(t * 8)
    const y = rect.y + rect.h + row
    const x = rect.x + shift + inset
    const w = Math.max(2, rect.w - inset * 2)
    if (t > 0.62) dither(ctx, color, ground, x, y, w, 1, 'checker')
    else px(ctx, color, x, y, w, 1)
  }
}
