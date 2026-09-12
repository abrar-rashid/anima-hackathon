/**
 * The two static layers.
 *
 * `bakeGround` draws the whole 1024x704 world once: grass, roads, driveways and
 * the park. It never changes, so it is baked at mount and blitted thereafter.
 *
 * `bakeStructures` draws buildings, homes, props and cast shadows, and is
 * re-baked only when the sky phase changes or the catalogue names change —
 * four possible phases, so in practice a handful of times per session.
 *
 * Everything that moves is drawn per frame in `render.ts`. Keeping static and
 * dynamic apart is what lets the town be dense without costing frame rate.
 */

import type { Site } from '@/ctl/contracts'
import { INK, PALETTE, hashIndex, rampFromHex, type SkyPhase } from './palette'
import { createSurface, dither, px, rampGradientV, scatter, type Ctx2D } from './pixel'
import {
  GATES,
  PARK,
  PATIENT_HOMES,
  ROAD_COLS,
  ROAD_HALF,
  ROAD_ROWS,
  SITE_ORDER,
  SITE_PLOTS,
  WORLD_H,
  WORLD_W,
  driveways,
  roadSegments,
  type Rect,
} from './layout'
import { drawBuilding, drawBuildingShadow, type BuildingStyle } from './draw-buildings'
import { drawHedge, drawHome, drawProp, drawSignpost, lampHead, type PropPlacement } from './draw-props'
import type { TownSite } from './model'

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

const TILE = 16

/**
 * Grass.
 *
 * Four deterministic tile treatments mixed across the map, plus tufts and dry
 * patches, so no two screens of grass look the same and none of it is a single
 * flat green.
 */
function drawGrass(ctx: Ctx2D): void {
  const g = PALETTE.grass
  const dry = PALETTE.grassDry

  px(ctx, g.base, 0, 0, WORLD_W, WORLD_H)

  for (let ty = 0; ty < WORLD_H; ty += TILE) {
    for (let tx = 0; tx < WORLD_W; tx += TILE) {
      const variant = hashIndex(`g${tx}:${ty}`, 8)
      if (variant < 3) {
        dither(ctx, g.base, g.dark, tx, ty, TILE, TILE, 'coarse')
      } else if (variant < 6) {
        dither(ctx, g.base, g.light, tx, ty, TILE, TILE, 'checker')
      } else if (variant === 6) {
        // A patch of drier grass, which breaks up the field at distance.
        dither(ctx, g.light, dry.base, tx, ty, TILE, TILE, 'coarse')
      } else {
        px(ctx, g.base, tx, ty, TILE, TILE)
        dither(ctx, g.light, g.base, tx + 4, ty + 4, 8, 8, 'checker')
      }

      // Tufts: three pixels in an L, which reads as a blade at this scale.
      const tuft = hashIndex(`t${tx}:${ty}`, 4)
      if (tuft === 0) {
        const ox = tx + 3 + hashIndex(`x${tx}${ty}`, 8)
        const oy = ty + 4 + hashIndex(`y${tx}${ty}`, 8)
        px(ctx, g.highlight, ox, oy, 1, 2)
        px(ctx, g.light, ox + 1, oy + 1, 1, 1)
        px(ctx, g.dark, ox - 1, oy + 2, 3, 1)
      }
      if (tuft === 1) {
        scatter(ctx, g.highlight, tx, ty, TILE, TILE, 60, tx + ty + 3)
      }
      if (tuft === 2 && hashIndex(`f${tx}${ty}`, 3) === 0) {
        // Wildflowers.
        const ox = tx + 5
        const oy = ty + 7
        px(ctx, g.dark, ox, oy + 1, 1, 2)
        px(ctx, hashIndex(`c${tx}${ty}`, 2) === 0 ? PALETTE.lamp.highlight : PALETTE.paper.highlight, ox, oy, 1, 1)
      }
    }
  }
}

/** Kerb stones: laid before the surfaces so intersections stay continuous. */
function drawKerbs(ctx: Ctx2D): void {
  const pad = 3
  for (const segment of roadSegments()) {
    px(ctx, PALETTE.kerb.dark, segment.x - pad, segment.y - pad, segment.w + pad * 2, segment.h + pad * 2)
    px(ctx, PALETTE.kerb.base, segment.x - pad, segment.y - pad, segment.w + pad * 2, pad)
    px(
      ctx,
      PALETTE.kerb.light,
      segment.x - pad,
      segment.y + segment.h,
      segment.w + pad * 2,
      pad,
    )
  }
}

/**
 * Road surface: grain, edge stones and a worn centre where the wheels run.
 * The worn strip is the detail that makes a road read as used.
 */
function drawRoadSurfaces(ctx: Ctx2D): void {
  const p = PALETTE.paving
  for (const segment of roadSegments()) {
    px(ctx, p.base, segment.x, segment.y, segment.w, segment.h)
    dither(ctx, p.base, p.dark, segment.x, segment.y, segment.w, segment.h, 'coarse')

    if (segment.orientation === 'h') {
      const centre = segment.y + Math.floor(segment.h / 2)
      dither(ctx, p.light, p.base, segment.x, centre - 4, segment.w, 8, 'checker')
      px(ctx, p.light, segment.x, centre, segment.w, 1)
      // Edge stones.
      for (let x = segment.x; x < segment.x + segment.w; x += 7) {
        px(ctx, PALETTE.kerb.light, x, segment.y, 4, 2)
        px(ctx, PALETTE.kerb.light, x + 3, segment.y + segment.h - 2, 4, 2)
      }
      scatter(ctx, p.highlight, segment.x, segment.y + 2, segment.w, segment.h - 4, 170, 17)
    } else {
      const centre = segment.x + Math.floor(segment.w / 2)
      dither(ctx, p.light, p.base, centre - 4, segment.y, 8, segment.h, 'checker')
      px(ctx, p.light, centre, segment.y, 1, segment.h)
      for (let y = segment.y; y < segment.y + segment.h; y += 7) {
        px(ctx, PALETTE.kerb.light, segment.x, y, 2, 4)
        px(ctx, PALETTE.kerb.light, segment.x + segment.w - 2, y + 3, 2, 4)
      }
      scatter(ctx, p.highlight, segment.x + 2, segment.y, segment.w - 4, segment.h, 170, 23)
    }
  }
}

/** Driveways: beaten earth with a worn middle and stone edging. */
function drawDriveways(ctx: Ctx2D): void {
  const s = PALETTE.soil
  for (const path of driveways()) {
    px(ctx, s.base, path.x, path.y, path.w, path.h)
    dither(ctx, s.base, s.dark, path.x, path.y, path.w, path.h, 'coarse')
    dither(ctx, s.light, s.base, path.x + 4, path.y, path.w - 8, path.h, 'checker')
    for (let y = path.y; y < path.y + path.h; y += 5) {
      px(ctx, PALETTE.kerb.light, path.x, y, 2, 3)
      px(ctx, PALETTE.kerb.light, path.x + path.w - 2, y + 2, 2, 3)
    }
    scatter(ctx, s.highlight, path.x + 2, path.y, path.w - 4, path.h, 24, 31)
  }
}

/** The park: mown grass, two crossing paths, flowerbeds and a hedge boundary. */
function drawPark(ctx: Ctx2D): void {
  const g = PALETTE.grass
  px(ctx, g.light, PARK.x, PARK.y, PARK.w, PARK.h)
  dither(ctx, g.light, g.base, PARK.x, PARK.y, PARK.w, PARK.h, 'hstripe')
  // Mowing stripes.
  for (let y = PARK.y; y < PARK.y + PARK.h; y += 12) {
    dither(ctx, g.base, g.light, PARK.x, y, PARK.w, 6, 'checker')
  }

  const pathY = PARK.y + Math.floor(PARK.h / 2) - 6
  const pathX = PARK.x + Math.floor(PARK.w / 2) - 6
  for (const path of [
    { x: PARK.x, y: pathY, w: PARK.w, h: 12 },
    { x: pathX, y: PARK.y, w: 12, h: PARK.h },
  ]) {
    px(ctx, PALETTE.soil.light, path.x, path.y, path.w, path.h)
    dither(ctx, PALETTE.soil.light, PALETTE.soil.base, path.x, path.y, path.w, path.h, 'coarse')
    scatter(ctx, PALETTE.soil.highlight, path.x, path.y, path.w, path.h, 18, 41)
  }

  drawHedge(ctx, { x: PARK.x - 4, y: PARK.y - 6, w: PARK.w + 8, h: 8 }, 'park-n')
  drawHedge(ctx, { x: PARK.x - 4, y: PARK.y + PARK.h - 2, w: PARK.w + 8, h: 8 }, 'park-s')
  drawHedge(ctx, { x: PARK.x - 6, y: PARK.y, w: 8, h: PARK.h }, 'park-w')
  drawHedge(ctx, { x: PARK.x + PARK.w - 2, y: PARK.y, w: 8, h: PARK.h }, 'park-e')
}

/** Garden plots in front of the homes, so the residential block reads lived-in. */
function drawGardens(ctx: Ctx2D): void {
  for (const home of PATIENT_HOMES) {
    const plot: Rect = { x: home.x - 2, y: home.y + home.h, w: home.w + 4, h: 10 }
    px(ctx, PALETTE.grass.light, plot.x, plot.y, plot.w, plot.h)
    dither(ctx, PALETTE.grass.light, PALETTE.grass.base, plot.x, plot.y, plot.w, plot.h, 'checker')
    px(ctx, PALETTE.soil.base, plot.x + Math.floor(plot.w / 2) - 4, plot.y, 8, plot.h)
    dither(
      ctx,
      PALETTE.soil.light,
      PALETTE.soil.base,
      plot.x + Math.floor(plot.w / 2) - 4,
      plot.y,
      8,
      plot.h,
      'coarse',
    )
    scatter(ctx, PALETTE.grass.highlight, plot.x, plot.y, plot.w, plot.h, 22, home.x)
  }
}

export function bakeGround(): HTMLCanvasElement {
  const { canvas, ctx } = createSurface(WORLD_W, WORLD_H)
  drawGrass(ctx)
  drawPark(ctx)
  drawGardens(ctx)
  drawKerbs(ctx)
  drawRoadSurfaces(ctx)
  drawDriveways(ctx)
  return canvas
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

/**
 * The sky, baked to a viewport-sized layer.
 *
 * A banded dithered gradient costs thousands of fills to draw, so it is baked
 * once per phase and size and blitted thereafter. It shows in the margin around
 * the world and carries the hour before the eye reaches the buildings.
 */
export function bakeSky(phase: SkyPhase, w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = createSurface(Math.max(1, w), Math.max(1, h))
  const horizon = Math.floor(h * 0.55)
  rampGradientV(ctx, phase.skyTop, 'dark', 'highlight', 0, 0, w, horizon)
  rampGradientV(ctx, phase.skyHorizon, 'highlight', 'dark', 0, horizon, w, h - horizon)
  if (phase.id === 'night' || phase.id === 'dawn') {
    for (let y = 6; y < horizon; y += 31) {
      for (let x = 11; x < w; x += 47) {
        const jitter = hashIndex(`star${x}:${y}`, 17)
        px(ctx, PALETTE.paper.highlight, x + jitter, y + (jitter % 7), 1, 1)
        if (jitter % 5 === 0) px(ctx, PALETTE.paper.base, x + jitter + 1, y + (jitter % 7), 1, 1)
      }
    }
  }
  return canvas
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Hand-placed planting and furniture.
 *
 * Positions are fixed rather than generated so nothing ever lands in a road or
 * inside a building, and so the town is the same town every time it loads.
 */
export function propPlacements(): PropPlacement[] {
  const props: PropPlacement[] = []
  const push = (kind: PropPlacement['kind'], x: number, y: number) =>
    props.push({ kind, x, y, seed: `${kind}${x}${y}` })

  // Verge lamps, just clear of each road band.
  const lampRows = [ROAD_ROWS[0]! + ROAD_HALF + 2, ROAD_ROWS[1]! + ROAD_HALF + 2, ROAD_ROWS[2]! + ROAD_HALF + 2]
  for (const y of lampRows) {
    for (const x of [120, 268, 440, 596, 744, 900]) push('lamp', x, y)
  }
  for (const y of [96, 300, 528]) {
    push('lamp', ROAD_COLS[1]! + ROAD_HALF + 2, y)
    push('lamp', ROAD_COLS[2]! + ROAD_HALF + 2, y)
  }

  // Woodland between the northern plots.
  for (const [x, y] of [
    [296, 58],
    [324, 104],
    [292, 146],
    [332, 172],
    [600, 52],
    [636, 96],
    [604, 142],
    [648, 168],
  ] as const) {
    push(hashIndex(`w${x}${y}`, 2) === 0 ? 'broadleaf' : 'pine', x, y)
  }

  // Northern verge planting.
  for (const [x, y] of [
    [64, 44],
    [196, 46],
    [388, 44],
    [492, 46],
    [700, 44],
    [820, 46],
    [944, 44],
  ] as const) {
    push('bush', x, y)
  }

  // Middle band: verges beside the residential block and the two practices.
  for (const [x, y] of [
    [296, 252],
    [320, 300],
    [292, 358],
    [324, 404],
    [704, 254],
    [736, 302],
    [700, 360],
    [732, 406],
  ] as const) {
    push(hashIndex(`m${x}${y}`, 3) === 0 ? 'pine' : 'broadleaf', x, y)
  }
  push('van', 92, 246)
  push('van', 800, 486)
  push('postbox', 600, 250)
  push('bin', 420, 250)
  push('bin', 640, 486)
  push('bench', 180, 252)
  push('bench', 860, 252)
  push('planter', 300, 486)
  push('planter', 660, 250)

  // Park furniture and planting.
  push('bench', 420, 546)
  push('bench', 560, 604)
  push('broadleaf', 404, 566)
  push('broadleaf', 584, 570)
  push('planter', 500, 548)
  push('planter', 500, 618)

  // Southern verge.
  for (const [x, y] of [
    [300, 494],
    [336, 640],
    [700, 500],
    [948, 496],
    [60, 496],
    [64, 640],
    [944, 640],
  ] as const) {
    push(hashIndex(`s${x}${y}`, 2) === 0 ? 'broadleaf' : 'bush', x, y)
  }

  return props
}

/** Baseline used for depth sorting, so nearer things overlap farther ones. */
function propBaseline(prop: PropPlacement): number {
  switch (prop.kind) {
    case 'broadleaf':
      return prop.y + 36
    case 'pine':
      return prop.y + 42
    case 'lamp':
      return prop.y + 33
    case 'postbox':
      return prop.y + 22
    case 'van':
      return prop.y + 22
    default:
      return prop.y + 15
  }
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------

/** Sign text: the name if a source gave one, otherwise the real site id. */
export function signLinesFor(site: TownSite): string[] {
  if (!site.name) return []
  const words = site.name.toUpperCase().split(/\s+/)
  if (words.length <= 2) return [words.join(' ')]
  const mid = Math.ceil(words.length / 2)
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
}

export interface StructureBake {
  canvas: HTMLCanvasElement
  /** Lamp head positions, so the render loop can add glow at night. */
  lamps: { x: number; y: number }[]
}

export function bakeStructures(sites: TownSite[], phase: SkyPhase): StructureBake {
  const { canvas, ctx } = createSurface(WORLD_W, WORLD_H)
  const byId = new Map(sites.map((site) => [site.site, site]))
  const props = propPlacements()
  const sun = { dx: phase.shadowDx, dy: phase.shadowDy, length: phase.shadowLength }

  // Shadows first, so nothing in front of a building is painted over by its
  // own neighbour's shadow.
  ctx.globalAlpha = phase.shadowAlpha
  for (const site of SITE_ORDER) {
    drawBuildingShadow(ctx, SITE_PLOTS[site], sun, INK, PALETTE.grass.dark)
  }
  for (const home of PATIENT_HOMES) {
    const depth = Math.round(8 * sun.length * sun.dy)
    for (let row = 0; row < depth; row += 1) {
      const t = row / Math.max(1, depth)
      const shift = Math.round(home.h * 0.4 * sun.length * sun.dx * t)
      const inset = Math.round(t * 6)
      if (t > 0.6) {
        dither(ctx, INK, PALETTE.grass.dark, home.x + shift + inset, home.y + home.h + row, Math.max(2, home.w - inset * 2), 1, 'checker')
      } else {
        px(ctx, INK, home.x + shift + inset, home.y + home.h + row, Math.max(2, home.w - inset * 2), 1)
      }
    }
  }
  for (const prop of props) {
    if (prop.kind !== 'broadleaf' && prop.kind !== 'pine') continue
    const depth = Math.round(6 * sun.length * sun.dy)
    for (let row = 0; row < depth; row += 1) {
      const t = row / Math.max(1, depth)
      const shift = Math.round(26 * sun.length * sun.dx * t)
      dither(ctx, INK, PALETTE.grass.dark, prop.x + 4 + shift, propBaseline(prop) + row, 18, 1, 'checker')
    }
  }
  ctx.globalAlpha = 1

  // Then everything solid, back to front.
  interface Drawable {
    baseline: number
    draw: () => void
  }
  const drawables: Drawable[] = []

  for (const site of SITE_ORDER) {
    const plot = SITE_PLOTS[site]
    const data = byId.get(site)
    const style: BuildingStyle = {
      roof: rampFromHex(data?.colorHex ?? '', PALETTE.slate),
      lit: phase.windowsLit,
      signLines: data ? signLinesFor(data) : [],
      siteId: site,
      seed: site,
    }
    drawables.push({ baseline: plot.rect.y + plot.rect.h, draw: () => drawBuilding(ctx, plot, style) })
  }

  PATIENT_HOMES.forEach((home, index) => {
    drawables.push({
      baseline: home.y + home.h,
      draw: () => drawHome(ctx, home, `home-${index}`, phase.windowsLit),
    })
  })

  for (const gate of Object.values(GATES)) {
    if (gate.kind === 'homes') continue
    // Nudged clear of the road band it stands beside, never in the carriageway.
    const offsetX = gate.facing === 'east' ? 22 : gate.facing === 'west' ? -22 : 0
    const offsetY = gate.facing === 'south' ? 18 : gate.facing === 'north' ? -18 : 0
    drawables.push({
      baseline: gate.point.y + offsetY + 1,
      draw: () => drawSignpost(ctx, gate.point.x + offsetX, gate.point.y + offsetY, gate.id, gate.facing),
    })
  }

  for (const prop of props) {
    drawables.push({ baseline: propBaseline(prop), draw: () => drawProp(ctx, prop) })
  }

  drawables.sort((a, b) => a.baseline - b.baseline)
  for (const drawable of drawables) drawable.draw()

  return { canvas, lamps: props.filter((p) => p.kind === 'lamp').map(lampHead) }
}
