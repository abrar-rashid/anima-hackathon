/**
 * The moving cast, baked once into a spritesheet.
 *
 * One scale for everyone: a 14x22 logical-pixel cell, four directions, four
 * walk frames. The cycle is contact / passing / contact / passing, the standard
 * four-frame loop: on contact frames the legs are apart and the body sits at
 * rest height, on passing frames the legs close and the body lifts one pixel.
 * One pixel of bob at this scale is the difference between walking and sliding.
 *
 * Blitting from a sheet rather than re-drawing per frame keeps the cost of a
 * populated town flat, and guarantees a sprite is pixel-identical every frame.
 */

import { CIVIC_RAMPS, INK, PALETTE, SKIN_RAMPS, hashIndex, type Ramp } from './palette'
import { createSurface, dither, px, type Ctx2D } from './pixel'
import type { Facing } from './layout'

export const CELL_W = 14
export const CELL_H = 22
export const WALK_FRAMES = 4

export const FACINGS: readonly Facing[] = ['south', 'north', 'east', 'west']

export type ActorRole = 'clinician' | 'nurse' | 'courier' | 'resident' | 'agent'

export interface ActorSkin {
  id: string
  role: ActorRole
  skin: Ramp
  hair: Ramp
  top: Ramp
  bottom: Ramp
  /** Worn over the top: a white coat or a high-vis tabard. */
  over: Ramp | null
  /** Lanyard / badge pixel, which is how roles stay legible at zoom 1. */
  badge: string
}

const HAIR_RAMPS: readonly Ramp[] = [
  { dark: '#1a1520', base: '#2b2434', light: '#42374f', highlight: '#5b4d68' },
  { dark: '#3d2410', base: '#5c3a1c', light: '#7d5229', highlight: '#a06f3c' },
  { dark: '#4d4238', base: '#6e6154', light: '#908175', highlight: '#b3a698' },
]

/**
 * Role appearances. Uniform choices carry meaning at a glance — white coat for
 * the clinician, NHS-blue tunic for the nurse, high-vis for the courier — and
 * are the only thing distinguishing them, because a sprite this size cannot
 * carry a label.
 */
export function actorSkins(): ActorSkin[] {
  const skins: ActorSkin[] = [
    {
      id: 'clinician',
      role: 'clinician',
      skin: SKIN_RAMPS[0]!,
      hair: HAIR_RAMPS[0]!,
      top: PALETTE.nhsBlue,
      bottom: PALETTE.slate,
      over: PALETTE.coat,
      badge: PALETTE.calm.highlight,
    },
    {
      id: 'clinician-b',
      role: 'clinician',
      skin: SKIN_RAMPS[2]!,
      hair: HAIR_RAMPS[1]!,
      top: PALETTE.calm,
      bottom: PALETTE.slate,
      over: PALETTE.coat,
      badge: PALETTE.nhsBlue.highlight,
    },
    {
      id: 'nurse',
      role: 'nurse',
      skin: SKIN_RAMPS[1]!,
      hair: HAIR_RAMPS[2]!,
      top: PALETTE.nhsBlue,
      bottom: PALETTE.nhsBlue,
      over: null,
      badge: PALETTE.coat.highlight,
    },
    {
      id: 'courier',
      role: 'courier',
      skin: SKIN_RAMPS[0]!,
      hair: HAIR_RAMPS[1]!,
      top: PALETTE.slate,
      bottom: PALETTE.slate,
      over: PALETTE.hiVis,
      badge: PALETTE.hiVis.highlight,
    },
    {
      id: 'agent',
      role: 'agent',
      skin: SKIN_RAMPS[1]!,
      hair: HAIR_RAMPS[0]!,
      top: PALETTE.agent,
      bottom: PALETTE.agent,
      over: null,
      badge: PALETTE.agent.highlight,
    },
  ]

  CIVIC_RAMPS.forEach((ramp, index) => {
    skins.push({
      id: `resident-${index}`,
      role: 'resident',
      skin: SKIN_RAMPS[hashIndex(`resident-${index}`, SKIN_RAMPS.length)]!,
      hair: HAIR_RAMPS[hashIndex(`hair-${index}`, HAIR_RAMPS.length)]!,
      top: ramp,
      bottom: index % 2 === 0 ? PALETTE.slate : PALETTE.wood,
      over: null,
      badge: ramp.highlight,
    })
  })

  return skins
}

interface LegPose {
  /** Horizontal offset of each foot, in pixels. */
  front: number
  back: number
  /** Body lift. Non-zero only on passing frames. */
  bob: number
  /** Arm swing, in pixels. */
  arm: number
}

function poseFor(frame: number): LegPose {
  switch (frame % WALK_FRAMES) {
    case 0:
      return { front: 2, back: -2, bob: 0, arm: 1 }
    case 1:
      return { front: 0, back: 0, bob: -1, arm: 0 }
    case 2:
      return { front: -2, back: 2, bob: 0, arm: -1 }
    default:
      return { front: 0, back: 0, bob: -1, arm: 0 }
  }
}

function drawHead(ctx: Ctx2D, skin: ActorSkin, x: number, y: number, facing: Facing): void {
  const { skin: s, hair } = skin
  // Skull: a 6x6 block with the light coming from the upper left.
  px(ctx, s.base, x + 4, y + 2, 6, 6)
  px(ctx, s.light, x + 4, y + 2, 4, 3)
  px(ctx, s.dark, x + 4, y + 7, 6, 1)
  dither(ctx, s.base, s.dark, x + 8, y + 4, 2, 3, 'checker')

  // Hair, cut to the facing so the back of a head reads as a back.
  px(ctx, hair.base, x + 3, y + 1, 8, 2)
  px(ctx, hair.light, x + 4, y + 1, 5, 1)
  px(ctx, hair.dark, x + 3, y + 3, 1, 3)
  px(ctx, hair.dark, x + 10, y + 3, 1, 3)

  if (facing === 'north') {
    px(ctx, hair.base, x + 3, y + 1, 8, 6)
    px(ctx, hair.light, x + 4, y + 1, 5, 2)
    dither(ctx, hair.base, hair.dark, x + 3, y + 5, 8, 2, 'checker')
    return
  }

  if (facing === 'south') {
    px(ctx, INK, x + 5, y + 5, 1, 1)
    px(ctx, INK, x + 8, y + 5, 1, 1)
    px(ctx, s.dark, x + 6, y + 6, 2, 1)
    return
  }

  // Profile: one eye, and the far cheek dropped a value.
  const eyeX = facing === 'east' ? x + 8 : x + 5
  px(ctx, INK, eyeX, y + 5, 1, 1)
  px(ctx, s.dark, facing === 'east' ? x + 4 : x + 9, y + 3, 1, 4)
}

function drawTorso(ctx: Ctx2D, skin: ActorSkin, x: number, y: number, facing: Facing, pose: LegPose): void {
  const top = skin.over ?? skin.top
  const bodyY = y + 8

  // Torso block with a lit left shoulder and a dithered fall-off to the right.
  px(ctx, top.base, x + 4, bodyY, 6, 7)
  px(ctx, top.light, x + 4, bodyY, 3, 5)
  dither(ctx, top.base, top.dark, x + 8, bodyY + 1, 2, 6, 'checker')
  px(ctx, top.dark, x + 4, bodyY + 6, 6, 1)

  if (skin.over) {
    // A coat or tabard hangs open: the tunic underneath shows as a centre strip.
    px(ctx, skin.top.base, x + 6, bodyY + 1, 2, 5)
    px(ctx, skin.top.light, x + 6, bodyY + 1, 1, 3)
  }

  if (skin.role === 'courier') {
    // Two reflective bands, the read that says courier at any zoom.
    px(ctx, PALETTE.hiVis.highlight, x + 4, bodyY + 2, 6, 1)
    px(ctx, PALETTE.hiVis.highlight, x + 4, bodyY + 5, 6, 1)
  }

  // Arms swing opposite the legs.
  const armY = bodyY + 1
  const swing = pose.arm
  if (facing === 'east' || facing === 'west') {
    const dir = facing === 'east' ? 1 : -1
    px(ctx, top.dark, x + (facing === 'east' ? 9 : 4), armY + swing + 1, 1, 4)
    px(ctx, skin.skin.base, x + (facing === 'east' ? 9 : 4) + dir * 0, armY + swing + 5, 1, 1)
  } else {
    px(ctx, top.dark, x + 3, armY - swing, 1, 5)
    px(ctx, top.dark, x + 10, armY + swing, 1, 5)
    px(ctx, skin.skin.base, x + 3, armY - swing + 5, 1, 1)
    px(ctx, skin.skin.base, x + 10, armY + swing + 5, 1, 1)
  }

  if (facing !== 'north') px(ctx, skin.badge, x + 5, bodyY + 3, 1, 1)
}

function drawLegs(ctx: Ctx2D, skin: ActorSkin, x: number, y: number, facing: Facing, pose: LegPose): void {
  const { bottom } = skin
  const legY = y + 15
  const shoe = PALETTE.wood

  if (facing === 'east' || facing === 'west') {
    const lead = facing === 'east' ? pose.front : -pose.front
    const trail = facing === 'east' ? pose.back : -pose.back
    px(ctx, bottom.base, x + 6 + Math.round(lead / 2), legY, 2, 5)
    px(ctx, bottom.dark, x + 6 + Math.round(trail / 2), legY, 2, 5)
    px(ctx, shoe.base, x + 5 + lead, legY + 5, 3, 1)
    px(ctx, shoe.dark, x + 5 + trail, legY + 5, 3, 1)
    return
  }

  const spread = Math.abs(pose.front)
  px(ctx, bottom.base, x + 5 - Math.round(spread / 2), legY, 2, 5)
  px(ctx, bottom.base, x + 8 + Math.round(spread / 2) - 1, legY, 2, 5)
  px(ctx, bottom.dark, x + 5 - Math.round(spread / 2), legY + 4, 2, 1)
  px(ctx, bottom.dark, x + 8 + Math.round(spread / 2) - 1, legY + 4, 2, 1)
  px(ctx, shoe.base, x + 4 - Math.round(spread / 2), legY + 5, 3, 1)
  px(ctx, shoe.base, x + 8 + Math.round(spread / 2) - 1, legY + 5, 3, 1)
}

/** One cell: a whole actor, posed. */
export function drawActorCell(
  ctx: Ctx2D,
  skin: ActorSkin,
  x: number,
  y: number,
  facing: Facing,
  frame: number,
): void {
  const pose = poseFor(frame)
  const top = y + pose.bob

  // Contact shadow. Small, dithered, and part of the sprite so the actor is
  // never a cut-out floating above the ground.
  dither(ctx, INK, PALETTE.grass.dark, x + 4, y + 20, 6, 1, 'checker')

  drawLegs(ctx, skin, x, top, facing, pose)
  drawTorso(ctx, skin, x, top, facing, pose)
  drawHead(ctx, skin, x, top, facing)
}

// ---------------------------------------------------------------------------
// Documents, markers and indicators
// ---------------------------------------------------------------------------

export const DOC_W = 11
export const DOC_H = 13
export const DOC_FRAMES = 3

/**
 * A document in flight: a folded sheet with a wax-seal dot and a shaded fold.
 * Three frames of flutter, which is enough to read as paper moving without
 * becoming a distraction across a town-wide view.
 */
export function drawDocCell(ctx: Ctx2D, x: number, y: number, frame: number): void {
  const tilt = frame === 1 ? 1 : frame === 2 ? -1 : 0
  const p = PALETTE.paper

  px(ctx, INK, x + 1, y + 1 + tilt, 9, 11)
  px(ctx, p.base, x + 2, y + 2 + tilt, 7, 9)
  px(ctx, p.light, x + 2, y + 2 + tilt, 7, 4)
  px(ctx, p.highlight, x + 2, y + 2 + tilt, 5, 1)
  dither(ctx, p.base, p.dark, x + 2, y + 8 + tilt, 7, 3, 'checker')

  // Ruled lines, so the sprite reads as a written record not a blank tile.
  px(ctx, p.dark, x + 3, y + 4 + tilt, 5, 1)
  px(ctx, p.dark, x + 3, y + 6 + tilt, 4, 1)
  px(ctx, p.dark, x + 3, y + 9 + tilt, 5, 1)

  // Folded corner, and a seal.
  px(ctx, p.highlight, x + 7, y + 2 + tilt, 2, 2)
  px(ctx, p.dark, x + 7, y + 3 + tilt, 2, 1)
  px(ctx, PALETTE.alarm.base, x + 4, y + 7 + tilt, 2, 2)
  px(ctx, PALETTE.alarm.highlight, x + 4, y + 7 + tilt, 1, 1)
}

export const MARKER_W = 9
export const MARKER_H = 11

/**
 * An unclosed record above a building: a small pinned docket. The ramp comes
 * from breach state, which is arithmetic on `dueAt`, so amber and red here mean
 * "late", never "clinically serious".
 */
export function drawMarkerCell(ctx: Ctx2D, ramp: Ramp, x: number, y: number): void {
  px(ctx, INK, x, y, 9, 10)
  px(ctx, ramp.base, x + 1, y + 1, 7, 8)
  px(ctx, ramp.light, x + 1, y + 1, 7, 3)
  px(ctx, ramp.highlight, x + 1, y + 1, 4, 1)
  dither(ctx, ramp.base, ramp.dark, x + 1, y + 6, 7, 3, 'checker')
  px(ctx, PALETTE.paper.light, x + 3, y + 3, 3, 1)
  px(ctx, PALETTE.paper.light, x + 3, y + 5, 2, 1)
  // Pin.
  px(ctx, PALETTE.steel.light, x + 4, y, 1, 2)
  px(ctx, PALETTE.steel.highlight, x + 4, y, 1, 1)
}

export const THINK_W = 13
export const THINK_H = 11
export const THINK_FRAMES = 3

/** Three dots that fill in turn: the agent is reading, and you can see it. */
export function drawThinkCell(ctx: Ctx2D, x: number, y: number, frame: number): void {
  const bubble = PALETTE.coat
  px(ctx, INK, x + 1, y, 11, 8)
  px(ctx, bubble.highlight, x + 2, y + 1, 9, 6)
  dither(ctx, bubble.highlight, bubble.light, x + 2, y + 5, 9, 2, 'checker')
  px(ctx, INK, x + 4, y + 8, 2, 1)
  px(ctx, INK, x + 3, y + 9, 2, 1)
  for (let i = 0; i < 3; i += 1) {
    const on = i <= frame
    px(ctx, on ? PALETTE.agent.base : bubble.light, x + 3 + i * 3, y + 3, 2, 2)
    if (on) px(ctx, PALETTE.agent.highlight, x + 3 + i * 3, y + 3, 1, 1)
  }
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

export interface Frame {
  x: number
  y: number
  w: number
  h: number
}

export interface ActorSheet {
  canvas: HTMLCanvasElement
  frames: Map<string, Frame>
  skins: ActorSkin[]
}

const SHEET_W = 512

/** Shelf packer. Rows advance by the tallest cell placed in them. */
class Shelf {
  private x = 0
  private y = 0
  private rowH = 0

  place(w: number, h: number): Frame {
    if (this.x + w > SHEET_W) {
      this.x = 0
      this.y += this.rowH + 1
      this.rowH = 0
    }
    const frame = { x: this.x, y: this.y, w, h }
    this.x += w + 1
    this.rowH = Math.max(this.rowH, h)
    return frame
  }

  get height(): number {
    return this.y + this.rowH + 1
  }
}

export function actorKey(skinId: string, facing: Facing, frame: number): string {
  return `actor:${skinId}:${facing}:${frame}`
}

export function bakeActorSheet(): ActorSheet {
  const skins = actorSkins()
  const shelf = new Shelf()
  const plan: { key: string; frame: Frame; draw: (ctx: Ctx2D, f: Frame) => void }[] = []

  for (const skin of skins) {
    for (const facing of FACINGS) {
      for (let frame = 0; frame < WALK_FRAMES; frame += 1) {
        const slot = shelf.place(CELL_W, CELL_H)
        plan.push({
          key: actorKey(skin.id, facing, frame),
          frame: slot,
          draw: (ctx, f) => drawActorCell(ctx, skin, f.x, f.y, facing, frame),
        })
      }
    }
  }

  for (let frame = 0; frame < DOC_FRAMES; frame += 1) {
    const slot = shelf.place(DOC_W, DOC_H)
    plan.push({ key: `doc:${frame}`, frame: slot, draw: (ctx, f) => drawDocCell(ctx, f.x, f.y, frame) })
  }

  for (const [state, ramp] of [
    ['breached', PALETTE.alarm],
    ['due-soon', PALETTE.amber],
    ['on-time', PALETTE.calm],
    ['no-deadline', PALETTE.paving],
  ] as const) {
    const slot = shelf.place(MARKER_W, MARKER_H)
    plan.push({ key: `marker:${state}`, frame: slot, draw: (ctx, f) => drawMarkerCell(ctx, ramp, f.x, f.y) })
  }

  for (let frame = 0; frame < THINK_FRAMES; frame += 1) {
    const slot = shelf.place(THINK_W, THINK_H)
    plan.push({ key: `think:${frame}`, frame: slot, draw: (ctx, f) => drawThinkCell(ctx, f.x, f.y, frame) })
  }

  const { canvas, ctx } = createSurface(SHEET_W, shelf.height)
  const frames = new Map<string, Frame>()
  for (const item of plan) {
    item.draw(ctx, item.frame)
    frames.set(item.key, item.frame)
  }

  return { canvas, frames, skins }
}
