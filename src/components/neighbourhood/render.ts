/**
 * One frame.
 *
 * The static layers are blitted whole and the browser clips them; only the cast
 * of characters, the documents in flight and the work markers are drawn per
 * frame. The transform is set to an integer zoom with an integer camera offset,
 * and smoothing is off, so a logical pixel is always an exact square of device
 * pixels.
 */

import type { Site } from '@/ctl/contracts'
import { INK, PALETTE, breachRamp, type SkyPhase } from './palette'
import { bitmapText, dither, px, textWidth, type Ctx2D } from './pixel'
import {
  SITE_PLOTS,
  WORLD_H,
  WORLD_W,
  plotBounds,
  pointAlong,
  type Point,
  type Zoom,
} from './layout'
import type { TownModel } from './model'
import {
  CELL_H,
  CELL_W,
  DOC_H,
  DOC_W,
  MARKER_H,
  MARKER_W,
  THINK_H,
  THINK_W,
  actorKey,
  type ActorSheet,
} from './sprites-actors'
import { actorPosition, docPosition, type Actor, type WorldState } from './engine'

export interface Viewport {
  w: number
  h: number
  dpr: number
}

export interface RenderInput {
  ctx: Ctx2D
  view: Viewport
  cam: Point
  zoom: Zoom
  phase: SkyPhase
  /** Pre-baked layers. Baking these is what keeps the frame budget flat. */
  sky: HTMLCanvasElement
  ground: HTMLCanvasElement
  structures: HTMLCanvasElement
  lamps: { x: number; y: number }[]
  sheet: ActorSheet
  world: WorldState
  model: TownModel
  hovered: Site | null
  selected: Site | null
  /** Frozen for prefers-reduced-motion: no bob, no flutter, no glow pulse. */
  reduced: boolean
}

function drawSky(input: RenderInput): void {
  const { ctx, view, sky } = input
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
  ctx.drawImage(sky, 0, 0)
}

function applyWorldTransform(input: RenderInput): void {
  const { ctx, view, cam, zoom } = input
  const scale = zoom * view.dpr
  // Integer camera offset: a fractional offset would land sprites between
  // device pixels and undo the crispness the integer zoom buys.
  ctx.setTransform(scale, 0, 0, scale, -Math.round(cam.x) * scale, -Math.round(cam.y) * scale)
}

function drawMarkers(input: RenderInput): void {
  const { ctx, world, model, sheet, reduced } = input
  const bobPhase = reduced ? 0 : world.elapsedMs / 420

  for (const site of model.sites) {
    if (site.work.length === 0) continue
    const plot = SITE_PLOTS[site.site]
    const bounds = plotBounds(plot)
    const perRow = 6
    const shown = Math.min(site.work.length, 12)
    const baseY = bounds.y - 16

    for (let i = 0; i < shown; i += 1) {
      const item = site.work[i]!
      const frame = sheet.frames.get(`marker:${item.breach}`)
      if (!frame) continue
      const row = Math.floor(i / perRow)
      const col = i % perRow
      const count = Math.min(shown - row * perRow, perRow)
      const rowW = count * (MARKER_W + 2) - 2
      const x = Math.round(bounds.x + bounds.w / 2 - rowW / 2 + col * (MARKER_W + 2))
      const bob = reduced ? 0 : Math.round(Math.sin(bobPhase + i * 0.7) * 1.5)
      const y = Math.round(baseY - row * (MARKER_H + 3) + bob)

      // A dashed thread back to the roof, so markers belong to a building.
      for (let ty = y + MARKER_H; ty < y + MARKER_H + 7; ty += 2) px(ctx, INK, x + 4, ty, 1, 1)
      ctx.drawImage(sheet.canvas, frame.x, frame.y, frame.w, frame.h, x, y, frame.w, frame.h)
    }

    if (site.work.length > shown) {
      const label = `+${site.work.length - shown}`
      const w = textWidth(label) + 4
      const x = Math.round(bounds.x + bounds.w / 2 - w / 2)
      const y = Math.round(baseY - 2 * (MARKER_H + 3) - 2)
      px(ctx, INK, x, y, w, 9)
      bitmapText(ctx, label, x + 2, y + 1, PALETTE.paper.highlight)
    }
  }
}

function drawLampGlow(input: RenderInput): void {
  const { ctx, phase, lamps, world, reduced } = input
  if (!phase.lampsLit) return
  const flicker = reduced ? 1 : 0.88 + Math.sin(world.elapsedMs / 700) * 0.12

  // Three nested pools rather than a dithered falloff: a glow is the one place
  // alpha is cheaper and reads better than a checkerboard.
  for (const lamp of lamps) {
    ctx.globalAlpha = 0.1 * flicker
    px(ctx, PALETTE.lamp.highlight, lamp.x - 14, lamp.y - 8, 29, 34)
    ctx.globalAlpha = 0.14 * flicker
    px(ctx, PALETTE.lamp.highlight, lamp.x - 9, lamp.y - 5, 19, 26)
    ctx.globalAlpha = 0.2 * flicker
    px(ctx, PALETTE.lamp.highlight, lamp.x - 5, lamp.y - 3, 11, 18)
    ctx.globalAlpha = 1
    px(ctx, PALETTE.lamp.light, lamp.x - 1, lamp.y - 2, 3, 4)
    px(ctx, PALETTE.lamp.highlight, lamp.x, lamp.y - 1, 1, 3)
  }
}

/** Faint dashed line showing where a document has been and where it is going. */
function drawDocTrail(input: RenderInput): void {
  const { ctx, world, zoom } = input
  if (zoom < 2) return
  for (const flying of world.docs) {
    const t = flying.routeLength === 0 ? 1 : flying.travelled / flying.routeLength
    ctx.globalAlpha = 0.4
    for (let s = 0; s < 1; s += 0.012) {
      const { at } = pointAlong(flying.route, s)
      const ahead = s > t
      px(ctx, ahead ? PALETTE.paper.dark : PALETTE.paper.highlight, Math.round(at.x), Math.round(at.y), 1, 1)
    }
    ctx.globalAlpha = 1
  }
}

function blitActor(input: RenderInput, actor: Actor, at: Point): void {
  const { ctx, sheet } = input
  const frame = sheet.frames.get(actorKey(actor.skinId, actor.facing, actor.dwellMs > 0 ? 0 : actor.frame))
  if (!frame) return
  ctx.drawImage(
    sheet.canvas,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    Math.round(at.x - CELL_W / 2),
    Math.round(at.y - CELL_H),
    frame.w,
    frame.h,
  )
}

function drawBubble(input: RenderInput, at: Point, lines: string[]): void {
  const { ctx, zoom } = input
  if (zoom < 2 || lines.length === 0) return
  const widest = Math.max(...lines.map((line) => textWidth(line)))
  const w = widest + 10
  const h = lines.length * 9 + 8
  const x = Math.round(at.x - w / 2)
  const y = Math.round(at.y - CELL_H - h - 8)

  px(ctx, INK, x - 1, y - 1, w + 2, h + 2)
  px(ctx, PALETTE.coat.highlight, x, y, w, h)
  dither(ctx, PALETTE.coat.highlight, PALETTE.coat.light, x, y + h - 4, w, 4, 'checker')
  px(ctx, PALETTE.agent.base, x, y, w, 2)
  px(ctx, INK, Math.round(at.x) - 2, y + h, 5, 2)
  px(ctx, INK, Math.round(at.x) - 1, y + h + 2, 3, 2)

  lines.forEach((line, index) => {
    bitmapText(ctx, line, x + 5, y + 5 + index * 9, index === 0 ? PALETTE.agent.dark : INK)
  })
}

function drawAgent(input: RenderInput): void {
  const { ctx, world, sheet, reduced } = input
  const agent = world.agent
  const at = actorPosition(agent.actor)
  blitActor(input, agent.actor, at)

  if (agent.state === 'thinking') {
    const frameIndex = reduced ? 2 : Math.floor(world.elapsedMs / 260) % 3
    const frame = sheet.frames.get(`think:${frameIndex}`)
    if (frame) {
      ctx.drawImage(
        sheet.canvas,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        Math.round(at.x + 4),
        Math.round(at.y - CELL_H - THINK_H + 2),
        THINK_W,
        THINK_H,
      )
    }
  } else if (agent.state === 'proposing') {
    drawBubble(input, at, agent.bubble)
  }
}

function drawHighlight(input: RenderInput, site: Site, ramp: { base: string; highlight: string }): void {
  const { ctx } = input
  const bounds = plotBounds(SITE_PLOTS[site])
  const pad = 3
  const x = bounds.x - pad
  const y = bounds.y - pad
  const w = bounds.w + pad * 2
  const h = bounds.h + pad * 2
  // Corner brackets rather than a full box: a full box buries the building.
  const arm = 12
  for (const [cx, cy, sx, sy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ] as const) {
    px(ctx, ramp.highlight, sx > 0 ? cx : cx - arm, cy, arm, 2)
    px(ctx, ramp.highlight, cx - (sx > 0 ? 0 : 2), sy > 0 ? cy : cy - arm, 2, arm)
  }
}

export function renderFrame(input: RenderInput): void {
  const { ctx, view, phase, world, zoom, reduced } = input

  ctx.imageSmoothingEnabled = false
  drawSky(input)
  applyWorldTransform(input)
  ctx.imageSmoothingEnabled = false

  ctx.drawImage(input.ground, 0, 0)
  ctx.drawImage(input.structures, 0, 0)

  // The hour, laid over the world only, so the sky margin keeps its gradient.
  if (phase.washAlpha > 0) {
    ctx.globalAlpha = phase.washAlpha
    px(ctx, phase.washHex, 0, 0, WORLD_W, WORLD_H)
    ctx.globalAlpha = 1
  }

  drawLampGlow(input)

  if (input.hovered && input.hovered !== input.selected) {
    drawHighlight(input, input.hovered, { base: PALETTE.paper.base, highlight: PALETTE.paper.highlight })
  }
  if (input.selected) {
    drawHighlight(input, input.selected, { base: PALETTE.amber.base, highlight: PALETTE.amber.highlight })
  }

  drawMarkers(input)
  drawDocTrail(input)

  // Everything that moves, depth sorted so a sprite lower on the map is nearer.
  interface Sprite {
    y: number
    draw: () => void
  }
  const sprites: Sprite[] = []

  for (const actor of world.actors) {
    const at = actorPosition(actor)
    sprites.push({ y: at.y, draw: () => blitActor(input, actor, at) })
  }

  for (const flying of world.docs) {
    const { at, arrived } = docPosition(flying)
    const frameIndex = reduced ? 0 : flying.frame
    const frame = input.sheet.frames.get(`doc:${frameIndex}`)
    if (!frame) continue
    const lift = reduced ? 0 : Math.round(Math.sin(world.elapsedMs / 190 + at.x) * 1.5)
    sprites.push({
      y: at.y + 0.5,
      draw: () => {
        // A shadow under the sheet, so it reads as carried above the ground.
        ctx.globalAlpha = 0.3
        px(ctx, INK, Math.round(at.x - 4), Math.round(at.y + 2), 9, 2)
        ctx.globalAlpha = 1
        ctx.drawImage(
          input.sheet.canvas,
          frame.x,
          frame.y,
          frame.w,
          frame.h,
          Math.round(at.x - DOC_W / 2),
          Math.round(at.y - DOC_H - 6 + lift),
          frame.w,
          frame.h,
        )
        if (arrived) {
          // A small flash where it lands, which is what makes an arrival legible.
          px(ctx, PALETTE.lamp.highlight, Math.round(at.x - 1), Math.round(at.y - 2), 3, 1)
          px(ctx, PALETTE.lamp.highlight, Math.round(at.x), Math.round(at.y - 3), 1, 3)
        }
        if (zoom >= 3) {
          const label = flying.towards
          const w = textWidth(label) + 4
          px(ctx, INK, Math.round(at.x - w / 2), Math.round(at.y + 4), w, 9)
          bitmapText(ctx, label, Math.round(at.x - w / 2) + 2, Math.round(at.y + 5), PALETTE.paper.highlight)
        }
      },
    })
  }

  sprites.sort((a, b) => a.y - b.y)
  for (const sprite of sprites) sprite.draw()

  drawAgent(input)

  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
}

// ---------------------------------------------------------------------------
// Minimap
// ---------------------------------------------------------------------------

export interface MinimapInput {
  ctx: Ctx2D
  w: number
  h: number
  dpr: number
  structures: HTMLCanvasElement
  cam: Point
  zoom: Zoom
  view: Viewport
  model: TownModel
}

/**
 * Minimap: the structure layer scaled down, with a dot per site coloured by its
 * worst breach state, and the camera rectangle.
 */
export function renderMinimap(input: MinimapInput): void {
  const { ctx, w, h, dpr, structures, cam, zoom, view, model } = input
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  px(ctx, PALETTE.grass.dark, 0, 0, w, h)
  const scale = Math.min(w / WORLD_W, h / WORLD_H)
  const offX = (w - WORLD_W * scale) / 2
  const offY = (h - WORLD_H * scale) / 2
  ctx.drawImage(structures, offX, offY, WORLD_W * scale, WORLD_H * scale)

  for (const site of model.sites) {
    const plot = SITE_PLOTS[site.site]
    const cx = offX + (plot.rect.x + plot.rect.w / 2) * scale
    const cy = offY + (plot.rect.y + plot.rect.h / 2) * scale
    const worst = site.readFailed
      ? 'no-deadline'
      : site.breachedCount > 0
        ? 'breached'
        : site.dueSoonCount > 0
          ? 'due-soon'
          : 'on-time'
    const ramp = breachRamp(worst as 'breached' | 'due-soon' | 'on-time' | 'no-deadline')
    px(ctx, INK, cx - 3, cy - 3, 6, 6)
    px(ctx, ramp.base, cx - 2, cy - 2, 4, 4)
    px(ctx, ramp.highlight, cx - 2, cy - 2, 2, 2)
  }

  const camW = (view.w / zoom) * scale
  const camH = (view.h / zoom) * scale
  const camX = offX + cam.x * scale
  const camY = offY + cam.y * scale
  ctx.strokeStyle = PALETTE.paper.highlight
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(camX) + 0.5, Math.round(camY) + 0.5, Math.round(camW), Math.round(camH))
}
