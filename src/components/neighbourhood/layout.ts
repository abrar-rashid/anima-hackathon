/**
 * The map: where things stand, where the roads run, and how to walk between
 * two places along them.
 *
 * All coordinates are logical pixels on an integer grid. The camera scales by
 * whole numbers only (see `ZOOM_LEVELS`) so a logical pixel is always an exact
 * square block of device pixels and never a resampled smear.
 *
 * Pure module: no canvas, no DOM, no clock. Everything here is testable.
 */

import type { Site } from '@/ctl/contracts'

export const WORLD_W = 1024
export const WORLD_H = 704

/** Integer-only zoom. Non-integer scaling is what makes pixel art look mushy. */
export const ZOOM_LEVELS = [1, 2, 3, 4] as const
export type Zoom = (typeof ZOOM_LEVELS)[number]
export const DEFAULT_ZOOM: Zoom = 2

export const TILE = 16
export const ROAD_HALF = 11

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A plot is a building footprint plus the geometry the renderer and the
 * pathfinder both need: where the door is, and where its driveway meets a road.
 */
export interface Plot {
  id: string
  /** Footprint of the ground floor. The roof overhangs it by 3px each side. */
  rect: Rect
  /** Storeys, which sets roof height and window rows. */
  storeys: number
  /** Door in world coordinates, on the front (bottom) wall. */
  door: Point
  /** Where the driveway meets the road centre line. */
  junction: Point
  /** Wider than tall reads as a civic block; taller reads as a house. */
  shape: 'civic' | 'block' | 'house' | 'lab'
}

/** Road centre lines. Everything that moves travels on one of these. */
export const ROAD_ROWS = [28, 228, 468, 676] as const
export const ROAD_COLS = [36, 348, 684, 988] as const

/** The seven catalogue sites, in the order they are laid out on the map. */
export const SITE_ORDER: readonly Site[] = [
  'hospital',
  'diagnostics',
  'referrals',
  'gp',
  'pharmacy',
  'community',
  'wearables',
]

export const SITE_PLOTS: Record<Site, Plot> = {
  hospital: {
    id: 'hospital',
    rect: { x: 92, y: 84, w: 184, h: 116 },
    storeys: 4,
    door: { x: 184, y: 200 },
    junction: { x: 184, y: 228 },
    shape: 'civic',
  },
  diagnostics: {
    id: 'diagnostics',
    rect: { x: 428, y: 100, w: 152, h: 100 },
    storeys: 2,
    door: { x: 504, y: 200 },
    junction: { x: 504, y: 228 },
    shape: 'lab',
  },
  referrals: {
    id: 'referrals',
    rect: { x: 772, y: 92, w: 152, h: 108 },
    storeys: 3,
    door: { x: 848, y: 200 },
    junction: { x: 848, y: 228 },
    shape: 'block',
  },
  gp: {
    id: 'gp',
    rect: { x: 100, y: 324, w: 168, h: 108 },
    storeys: 2,
    door: { x: 184, y: 432 },
    junction: { x: 184, y: 468 },
    shape: 'civic',
  },
  pharmacy: {
    id: 'pharmacy',
    rect: { x: 780, y: 332, w: 148, h: 100 },
    storeys: 2,
    door: { x: 854, y: 432 },
    junction: { x: 854, y: 468 },
    shape: 'house',
  },
  community: {
    id: 'community',
    rect: { x: 100, y: 540, w: 164, h: 108 },
    storeys: 2,
    door: { x: 182, y: 648 },
    junction: { x: 182, y: 676 },
    shape: 'house',
  },
  wearables: {
    id: 'wearables',
    rect: { x: 772, y: 548, w: 156, h: 100 },
    storeys: 2,
    door: { x: 850, y: 648 },
    junction: { x: 850, y: 676 },
    shape: 'lab',
  },
}

/**
 * A gate is a non-site scope that appears in real event `visibleTo` chains —
 * `ambulance`, `triage`, `beds`, `icb`, `nhsapp`, `population`, `messaging`,
 * `control`, `patient`. They are not catalogue sites, so they are not drawn as
 * one of the seven buildings; they are signed edge points where work enters or
 * leaves the neighbourhood.
 */
export interface Gate {
  id: string
  /** Where the sprite pauses; on a road line. */
  point: Point
  /** Which way the signpost faces, for sprite selection. */
  facing: 'north' | 'south' | 'east' | 'west'
  kind: 'gate' | 'homes'
}

export const GATES: Record<string, Gate> = {
  ambulance: { id: 'ambulance', point: { x: 36, y: 132 }, facing: 'east', kind: 'gate' },
  triage: { id: 'triage', point: { x: 216, y: 28 }, facing: 'south', kind: 'gate' },
  population: { id: 'population', point: { x: 456, y: 28 }, facing: 'south', kind: 'gate' },
  nhsapp: { id: 'nhsapp', point: { x: 660, y: 28 }, facing: 'south', kind: 'gate' },
  beds: { id: 'beds', point: { x: 988, y: 132 }, facing: 'west', kind: 'gate' },
  icb: { id: 'icb', point: { x: 988, y: 564 }, facing: 'west', kind: 'gate' },
  messaging: { id: 'messaging', point: { x: 216, y: 676 }, facing: 'north', kind: 'gate' },
  control: { id: 'control', point: { x: 604, y: 676 }, facing: 'north', kind: 'gate' },
  /** The patient scope is a row of homes in the middle of the map, not an edge. */
  patient: { id: 'patient', point: { x: 516, y: 468 }, facing: 'north', kind: 'homes' },
}

/** Houses making up the `patient` scope. Residents walk out of these. */
export const PATIENT_HOMES: readonly Rect[] = [
  { x: 424, y: 350, w: 56, h: 48 },
  { x: 492, y: 336, w: 60, h: 56 },
  { x: 564, y: 352, w: 52, h: 46 },
  { x: 456, y: 412, w: 54, h: 40 },
  { x: 528, y: 410, w: 58, h: 42 },
]

/** Fenced green between the community and wearables blocks. */
export const PARK: Rect = { x: 396, y: 520, w: 232, h: 136 }

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

export interface RoadSegment extends Rect {
  orientation: 'h' | 'v'
}

/** Road bands, derived from the centre lines so the two can never disagree. */
export function roadSegments(): RoadSegment[] {
  const segments: RoadSegment[] = []
  for (const y of ROAD_ROWS) {
    segments.push({
      x: ROAD_COLS[0]! - ROAD_HALF,
      y: y - ROAD_HALF,
      w: ROAD_COLS[ROAD_COLS.length - 1]! - ROAD_COLS[0]! + ROAD_HALF * 2,
      h: ROAD_HALF * 2,
      orientation: 'h',
    })
  }
  for (const x of ROAD_COLS) {
    segments.push({
      x: x - ROAD_HALF,
      y: ROAD_ROWS[0]! - ROAD_HALF,
      w: ROAD_HALF * 2,
      h: ROAD_ROWS[ROAD_ROWS.length - 1]! - ROAD_ROWS[0]! + ROAD_HALF * 2,
      orientation: 'v',
    })
  }
  return segments
}

/** Short driveways from each door down to its road. Drawn as worn paving. */
export function driveways(): Rect[] {
  const paths: Rect[] = []
  for (const plot of Object.values(SITE_PLOTS)) {
    const top = Math.min(plot.door.y, plot.junction.y)
    const height = Math.abs(plot.junction.y - plot.door.y)
    paths.push({ x: plot.door.x - 8, y: top, w: 16, h: height })
  }
  paths.push({ x: GATES.patient!.point.x - 8, y: 452, w: 16, h: 16 })
  return paths
}

// ---------------------------------------------------------------------------
// Road graph and pathfinding
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string
  point: Point
  neighbours: string[]
}

function nodeId(p: Point): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`
}

/**
 * Build the walkable graph: every road intersection, plus a junction node for
 * each plot driveway and each gate, connected along their shared road line.
 *
 * Built by collecting the points that sit on each centre line and joining
 * neighbours in order, so adding a plot cannot leave an orphaned node.
 */
export function buildRoadGraph(): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>()
  const ensure = (p: Point): GraphNode => {
    const id = nodeId(p)
    const existing = nodes.get(id)
    if (existing) return existing
    const created: GraphNode = { id, point: { x: Math.round(p.x), y: Math.round(p.y) }, neighbours: [] }
    nodes.set(id, created)
    return created
  }

  const onRow = new Map<number, Point[]>()
  const onCol = new Map<number, Point[]>()
  const addRow = (y: number, p: Point) => onRow.set(y, [...(onRow.get(y) ?? []), p])
  const addCol = (x: number, p: Point) => onCol.set(x, [...(onCol.get(x) ?? []), p])

  for (const y of ROAD_ROWS) {
    for (const x of ROAD_COLS) {
      const p = { x, y }
      ensure(p)
      addRow(y, p)
      addCol(x, p)
    }
  }

  const extras: Point[] = [
    ...Object.values(SITE_PLOTS).map((plot) => plot.junction),
    ...Object.values(GATES).map((gate) => gate.point),
  ]
  for (const p of extras) {
    ensure(p)
    const row = (ROAD_ROWS as readonly number[]).find((y) => y === p.y)
    if (row !== undefined) addRow(row, p)
    const col = (ROAD_COLS as readonly number[]).find((x) => x === p.x)
    if (col !== undefined) addCol(col, p)
  }

  const link = (a: Point, b: Point) => {
    const na = ensure(a)
    const nb = ensure(b)
    if (na.id === nb.id) return
    if (!na.neighbours.includes(nb.id)) na.neighbours.push(nb.id)
    if (!nb.neighbours.includes(na.id)) nb.neighbours.push(na.id)
  }

  for (const points of onRow.values()) {
    const sorted = [...points].sort((a, b) => a.x - b.x)
    for (let i = 0; i + 1 < sorted.length; i += 1) link(sorted[i]!, sorted[i + 1]!)
  }
  for (const points of onCol.values()) {
    const sorted = [...points].sort((a, b) => a.y - b.y)
    for (let i = 0; i + 1 < sorted.length; i += 1) link(sorted[i]!, sorted[i + 1]!)
  }

  return nodes
}

export const ROAD_GRAPH: Map<string, GraphNode> = buildRoadGraph()

function nearestNode(graph: Map<string, GraphNode>, p: Point): GraphNode | null {
  let best: GraphNode | null = null
  let bestDist = Infinity
  for (const node of graph.values()) {
    const d = Math.abs(node.point.x - p.x) + Math.abs(node.point.y - p.y)
    if (d < bestDist) {
      bestDist = d
      best = node
    }
  }
  return best
}

/**
 * Shortest road route between two world points, as a polyline.
 *
 * Dijkstra over the lattice. The returned polyline starts at `from` and ends
 * at `to`, with the road nodes in between, so a sprite that follows it walks
 * out of a door, along the streets, and up to the destination door.
 */
export function routeBetween(from: Point, to: Point, graph: Map<string, GraphNode> = ROAD_GRAPH): Point[] {
  const start = nearestNode(graph, from)
  const goal = nearestNode(graph, to)
  if (!start || !goal) return [from, to]
  if (start.id === goal.id) return [from, start.point, to]

  const dist = new Map<string, number>([[start.id, 0]])
  const prev = new Map<string, string>()
  const seen = new Set<string>()

  while (seen.size < graph.size) {
    let currentId: string | null = null
    let currentDist = Infinity
    for (const [id, d] of dist) {
      if (!seen.has(id) && d < currentDist) {
        currentDist = d
        currentId = id
      }
    }
    if (currentId === null) break
    if (currentId === goal.id) break
    seen.add(currentId)
    const node = graph.get(currentId)!
    for (const neighbourId of node.neighbours) {
      if (seen.has(neighbourId)) continue
      const neighbour = graph.get(neighbourId)
      if (!neighbour) continue
      const step = Math.hypot(neighbour.point.x - node.point.x, neighbour.point.y - node.point.y)
      const candidate = currentDist + step
      if (candidate < (dist.get(neighbourId) ?? Infinity)) {
        dist.set(neighbourId, candidate)
        prev.set(neighbourId, currentId)
      }
    }
  }

  const chain: Point[] = []
  let cursor: string | undefined = goal.id
  while (cursor) {
    const node = graph.get(cursor)
    if (!node) break
    chain.unshift(node.point)
    cursor = prev.get(cursor)
    if (cursor === start.id) {
      chain.unshift(start.point)
      break
    }
  }
  if (chain.length === 0) return [from, to]
  return [from, ...chain, to]
}

/** Anchor point for a scope id: a site door, a gate, or nothing. */
export function anchorFor(scope: string): Point | null {
  const plot = SITE_PLOTS[scope as Site]
  if (plot) return { x: plot.door.x, y: plot.door.y - 4 }
  const gate = GATES[scope]
  if (gate) return gate.point
  return null
}

export function isSiteScope(scope: string): scope is Site {
  return scope in SITE_PLOTS
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampZoom(zoom: number): Zoom {
  let best: Zoom = ZOOM_LEVELS[0]
  for (const level of ZOOM_LEVELS) {
    if (Math.abs(level - zoom) < Math.abs(best - zoom)) best = level
  }
  return best
}

export function stepZoom(zoom: Zoom, direction: 1 | -1): Zoom {
  const index = ZOOM_LEVELS.indexOf(zoom)
  const next = clamp(index + direction, 0, ZOOM_LEVELS.length - 1)
  return ZOOM_LEVELS[next]!
}

/**
 * Keep the camera inside the world. When the viewport is wider than the world
 * at this zoom the world is centred, which is what makes zoom 1 read as a
 * deliberate overview rather than a map stuck in a corner.
 */
export function clampCamera(cam: Point, zoom: number, viewW: number, viewH: number): Point {
  const visibleW = viewW / zoom
  const visibleH = viewH / zoom
  const x = visibleW >= WORLD_W ? (WORLD_W - visibleW) / 2 : clamp(cam.x, 0, WORLD_W - visibleW)
  const y = visibleH >= WORLD_H ? (WORLD_H - visibleH) / 2 : clamp(cam.y, 0, WORLD_H - visibleH)
  return { x, y }
}

export function screenToWorld(sx: number, sy: number, cam: Point, zoom: number): Point {
  return { x: cam.x + sx / zoom, y: cam.y + sy / zoom }
}

export function worldToScreen(wx: number, wy: number, cam: Point, zoom: number): Point {
  return { x: (wx - cam.x) * zoom, y: (wy - cam.y) * zoom }
}

export function centreOn(target: Point, zoom: number, viewW: number, viewH: number): Point {
  return clampCamera(
    { x: target.x - viewW / zoom / 2, y: target.y - viewH / zoom / 2 },
    zoom,
    viewW,
    viewH,
  )
}

/** The whole building including its roof overhang, for hit testing. */
export function plotBounds(plot: Plot): Rect {
  const roofH = 18 + plot.storeys * 4
  return {
    x: plot.rect.x - 4,
    y: plot.rect.y - roofH,
    w: plot.rect.w + 8,
    h: plot.rect.h + roofH,
  }
}

export function hitTestPlot(world: Point): Site | null {
  // Front to back, so a nearer building wins an overlapping click.
  for (const site of [...SITE_ORDER].reverse()) {
    const bounds = plotBounds(SITE_PLOTS[site])
    if (
      world.x >= bounds.x &&
      world.x <= bounds.x + bounds.w &&
      world.y >= bounds.y &&
      world.y <= bounds.y + bounds.h
    ) {
      return site
    }
  }
  return null
}

/** Total length of a polyline, so travel can be timed by distance not steps. */
export function polylineLength(points: readonly Point[]): number {
  let total = 0
  for (let i = 0; i + 1 < points.length; i += 1) {
    total += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y)
  }
  return total
}

/** Position at a normalised distance along a polyline, plus a facing vector. */
export function pointAlong(points: readonly Point[], t: number): { at: Point; dx: number; dy: number } {
  if (points.length === 0) return { at: { x: 0, y: 0 }, dx: 0, dy: 1 }
  if (points.length === 1) return { at: points[0]!, dx: 0, dy: 1 }
  const total = polylineLength(points)
  const target = clamp(t, 0, 1) * total
  let travelled = 0
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len === 0) continue
    if (travelled + len >= target) {
      const local = (target - travelled) / len
      return {
        at: { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local },
        dx: (b.x - a.x) / len,
        dy: (b.y - a.y) / len,
      }
    }
    travelled += len
  }
  const last = points[points.length - 1]!
  const prev = points[points.length - 2]!
  const len = Math.max(1, Math.hypot(last.x - prev.x, last.y - prev.y))
  return { at: last, dx: (last.x - prev.x) / len, dy: (last.y - prev.y) / len }
}

export type Facing = 'north' | 'south' | 'east' | 'west'

export function facingFrom(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west'
  return dy >= 0 ? 'south' : 'north'
}
