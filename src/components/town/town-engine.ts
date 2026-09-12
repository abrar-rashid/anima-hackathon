/** Pure layout and speech helpers for the 16-bit town canvas. */

export const WORLD_W = 2400
export const WORLD_H = 1600
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2.1

export interface TownLab {
  name: string
  value: number
  unit: string
  isAbnormal: boolean
  refLow?: number
  refHigh?: number
}

export interface TownSimulationData {
  clock: { now: number; paused: boolean; speed: number }
  patient: {
    id: string
    name: string
    /** Null when the simulator holds no result for this patient. */
    recentLab: TownLab | null
    observations?: Array<{ time: number; type: string; detail: string }>
  }
  caseStatus: {
    ownershipState: string
    closureState: string
    currentOwner: string
    deadlineMinutes: number
  }
  recentEvents: Array<{ id?: string; time?: number; type?: string; actor?: string; detail?: string }>
  districts?: Record<
    string,
    { id: string; name: string; status: string; recentEvent: string; activeCount?: number }
  >
}

export interface BuildingDef {
  id: string
  name: string
  role: string
  x: number
  y: number
  width: number
  height: number
  color: string
  roofColor: string
  accentColor: string
  icon: string
  sign: string
  short: string
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export interface SpeechRequest {
  id: string
  anchorX: number
  anchorY: number
  author: string
  text: string
}

export interface PlacedBubble extends SpeechRequest, Rect {
  lines: string[]
  pointerX: number
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'hospital',
    name: 'Hospital EPR',
    role: 'Northbank General · secondary care',
    x: 140,
    y: 90,
    width: 320,
    height: 230,
    color: '#c5d4e8',
    roofColor: '#1d4f9c',
    accentColor: '#dc2626',
    icon: '🏥',
    sign: 'NORTHBANK GENERAL',
    short: 'Hospital',
  },
  {
    id: 'diagnostics',
    name: 'Diagnostics',
    role: 'Laboratory reports',
    x: 880,
    y: 70,
    width: 280,
    height: 210,
    color: '#7ec8e3',
    roofColor: '#0e7490',
    accentColor: '#22d3ee',
    icon: '🔬',
    sign: 'DIAGNOSTICS',
    short: 'Diagnostics',
  },
  {
    id: 'gp',
    name: 'GP Records',
    role: 'Riverside Practice · primary care',
    x: 1860,
    y: 80,
    width: 300,
    height: 230,
    color: '#86c98a',
    roofColor: '#166534',
    accentColor: '#4ade80',
    icon: '🩺',
    sign: 'RIVERSIDE PRACTICE',
    short: 'GP Practice',
  },
  {
    id: 'pharmacy',
    name: 'Pharmacy',
    role: 'High Street Pharmacy',
    x: 120,
    y: 580,
    width: 260,
    height: 200,
    color: '#f0c96a',
    roofColor: '#b45309',
    accentColor: '#facc15',
    icon: '💊',
    sign: 'HIGH ST PHARMACY',
    short: 'Pharmacy',
  },
  {
    id: 'wearables',
    name: 'Home Health',
    role: 'Personal health journal',
    x: 1860,
    y: 540,
    width: 280,
    height: 210,
    color: '#818cf8',
    roofColor: '#312e81',
    accentColor: '#c4b5fd',
    icon: '⌚',
    sign: 'HOME HEALTH',
    short: 'Wearables',
  },
  {
    id: 'patient',
    name: 'Patient home',
    role: 'Home of the selected patient',
    x: 110,
    y: 1120,
    width: 280,
    height: 210,
    color: '#e8a5d8',
    roofColor: '#7e22ce',
    accentColor: '#f0abfc',
    icon: '🏡',
    sign: 'PATIENT HOME',
    short: 'Residence',
  },
  {
    id: 'community',
    name: 'Community Care',
    role: 'Community visiting team',
    x: 860,
    y: 1140,
    width: 320,
    height: 230,
    color: '#9bbb5c',
    roofColor: '#3f6212',
    accentColor: '#bef264',
    icon: '🌿',
    sign: 'COMMUNITY CARE',
    short: 'Rehab',
  },
  {
    id: 'referrals',
    name: 'Referrals',
    role: 'e-Referral Service',
    x: 1840,
    y: 1120,
    width: 300,
    height: 220,
    color: '#94a3b8',
    roofColor: '#1e293b',
    accentColor: '#cbd5e1',
    icon: '🏢',
    sign: 'REFERRALS',
    short: 'Referrals',
  },
]

export const DOORS: Record<string, Point> = {
  hospital: { x: 300, y: 372 },
  diagnostics: { x: 1020, y: 372 },
  gp: { x: 2010, y: 372 },
  pharmacy: { x: 250, y: 868 },
  wearables: { x: 2000, y: 868 },
  patient: { x: 250, y: 1428 },
  community: { x: 1020, y: 1428 },
  referrals: { x: 1990, y: 1428 },
}

/** Road graph used by the courier and idle wander. */
export const WAYPOINTS = {
  hospitalDoor: DOORS.hospital,
  labDoor: DOORS.diagnostics,
  gpDoor: DOORS.gp,
  pharmacyDoor: DOORS.pharmacy,
  wearablesDoor: DOORS.wearables,
  homeDoor: DOORS.patient,
  rehabDoor: DOORS.community,
  referralsDoor: DOORS.referrals,
  nw: { x: 268, y: 388 },
  nMid: { x: 1008, y: 388 },
  ne: { x: 2008, y: 388 },
  wMid: { x: 268, y: 868 },
  eMid: { x: 2008, y: 868 },
  sw: { x: 268, y: 1428 },
  sMid: { x: 1008, y: 1428 },
  se: { x: 2008, y: 1428 },
} as const

export const RUNNER_LOOP: Point[] = [
  WAYPOINTS.hospitalDoor,
  WAYPOINTS.nw,
  WAYPOINTS.nMid,
  WAYPOINTS.ne,
  WAYPOINTS.gpDoor,
  WAYPOINTS.ne,
  WAYPOINTS.nMid,
  WAYPOINTS.nw,
]

export const RUNNER_TO_GP: Point[] = [
  WAYPOINTS.nw,
  WAYPOINTS.nMid,
  WAYPOINTS.ne,
  WAYPOINTS.gpDoor,
]

export function buildingFootprint(b: BuildingDef): Rect {
  return { x: b.x - 10, y: b.y - 58, w: b.width + 20, h: b.height + 66 }
}

export function buildingBodies(): Rect[] {
  return BUILDINGS.map(buildingFootprint)
}

export function rectsOverlap(a: Rect, b: Rect, pad = 8): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  )
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM)
}

export function clampCamera(
  camX: number,
  camY: number,
  zoom: number,
  viewW: number,
  viewH: number,
): Point {
  const visibleW = viewW / zoom
  const visibleH = viewH / zoom
  const maxX = Math.max(0, WORLD_W - visibleW)
  const maxY = Math.max(0, WORLD_H - visibleH)
  return {
    x: clamp(camX, 0, maxX),
    y: clamp(camY, 0, maxY),
  }
}

export function screenToWorld(sx: number, sy: number, camX: number, camY: number, zoom: number): Point {
  return { x: camX + sx / zoom, y: camY + sy / zoom }
}

export function worldToScreen(wx: number, wy: number, camX: number, camY: number, zoom: number): Point {
  return { x: (wx - camX) * zoom, y: (wy - camY) * zoom }
}

export function zoomAround(
  sx: number,
  sy: number,
  camX: number,
  camY: number,
  oldZoom: number,
  nextZoom: number,
  viewW: number,
  viewH: number,
): { cam: Point; zoom: number } {
  const zoom = clampZoom(nextZoom)
  const world = screenToWorld(sx, sy, camX, camY, oldZoom)
  const cam = clampCamera(world.x - sx / zoom, world.y - sy / zoom, zoom, viewW, viewH)
  return { cam, zoom }
}

export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}

export function estimateBubbleSize(author: string, text: string): { w: number; h: number; lines: string[] } {
  const lines = wrapText(text, 34).slice(0, 3)
  const longest = Math.max(author.length + 3, ...lines.map((line) => line.length))
  const w = clamp(longest * 7.2 + 24, 168, 300)
  const h = 22 + lines.length * 14 + 10
  return { w, h, lines }
}

function overlapScore(rect: Rect, obstacles: Rect[], others: Rect[]): number {
  let score = 0
  for (const obstacle of obstacles) {
    if (rectsOverlap(rect, obstacle, 10)) score += 80
  }
  for (const other of others) {
    if (rectsOverlap(rect, other, 12)) score += 120
  }
  return score
}

function nudgeClear(
  rect: Rect,
  obstacles: Rect[],
  others: Rect[],
  bounds: { w: number; h: number } = { w: WORLD_W, h: WORLD_H },
): Rect {
  const next = { ...rect }
  const maxX = Math.max(12, bounds.w - next.w - 12)
  const maxY = Math.max(12, bounds.h - next.h - 12)
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const blocker = [...obstacles, ...others].find((item) => rectsOverlap(next, item, 10))
    if (!blocker) break
    const up = blocker.y - next.h - 14
    if (up >= 12 && !rectsOverlap({ ...next, y: up }, blocker, 10)) {
      next.y = up
      continue
    }
    const left = blocker.x - next.w - 14
    if (left >= 12 && !rectsOverlap({ ...next, x: left }, blocker, 10)) {
      next.x = left
      continue
    }
    const right = blocker.x + blocker.w + 14
    if (right + next.w <= bounds.w - 12 && !rectsOverlap({ ...next, x: right }, blocker, 10)) {
      next.x = right
      continue
    }
    next.y = clamp(blocker.y + blocker.h + 14, 12, maxY)
    next.x = clamp(next.x, 12, maxX)
  }
  next.x = clamp(next.x, 12, maxX)
  next.y = clamp(next.y, 12, maxY)
  return next
}

export function layoutSpeechBubbles(
  requests: SpeechRequest[],
  obstacles: Rect[],
  bounds: { w: number; h: number } = { w: WORLD_W, h: WORLD_H },
): PlacedBubble[] {
  const placed: PlacedBubble[] = []

  for (const request of requests) {
    const { w, h, lines } = estimateBubbleSize(request.author, request.text)
    const candidates: Point[] = [
      { x: request.anchorX - w / 2, y: request.anchorY - h - 20 },
      { x: request.anchorX - w - 16, y: request.anchorY - h - 8 },
      { x: request.anchorX + 20, y: request.anchorY - h - 8 },
      { x: request.anchorX - w / 2 - 70, y: request.anchorY - h - 28 },
      { x: request.anchorX - w / 2 + 70, y: request.anchorY - h - 28 },
      { x: request.anchorX - w / 2, y: request.anchorY - h - 64 },
      { x: request.anchorX - w / 2, y: request.anchorY + 26 },
      { x: request.anchorX - w - 24, y: request.anchorY - 10 },
      { x: request.anchorX + 24, y: request.anchorY - 10 },
    ]

    let best: Rect = { x: candidates[0]!.x, y: candidates[0]!.y, w, h }
    let bestScore = Number.POSITIVE_INFINITY

    for (const raw of candidates) {
      const rect = nudgeClear(
        {
          x: clamp(raw.x, 12, Math.max(12, bounds.w - w - 12)),
          y: clamp(raw.y, 12, Math.max(12, bounds.h - h - 12)),
          w,
          h,
        },
        obstacles,
        placed,
        bounds,
      )
      let score = overlapScore(rect, obstacles, placed)
      const dx = rect.x + rect.w / 2 - request.anchorX
      const dy = rect.y + rect.h - request.anchorY
      score += Math.hypot(dx, dy) * 0.15
      if (score < bestScore) {
        bestScore = score
        best = rect
      }
      if (score === 0) break
    }

    const cleared = nudgeClear(best, obstacles, placed, bounds)
    placed.push({
      ...request,
      x: cleared.x,
      y: cleared.y,
      w,
      h,
      lines,
      pointerX: clamp(request.anchorX, cleared.x + 10, cleared.x + w - 10),
    })
  }

  return placed
}

export function hitTestBuilding(x: number, y: number): BuildingDef | null {
  for (let i = BUILDINGS.length - 1; i >= 0; i -= 1) {
    const b = BUILDINGS[i]!
    if (x >= b.x - 8 && x <= b.x + b.width + 8 && y >= b.y - 58 && y <= b.y + b.height + 8) {
      return b
    }
  }
  return null
}

export function hitTestBubble(x: number, y: number, bubbles: PlacedBubble[]): PlacedBubble | null {
  for (let i = bubbles.length - 1; i >= 0; i -= 1) {
    const bubble = bubbles[i]!
    if (x >= bubble.x && x <= bubble.x + bubble.w && y >= bubble.y && y <= bubble.y + bubble.h) {
      return bubble
    }
  }
  return null
}

export function labPhrase(lab: TownLab): string {
  const range =
    lab.refLow != null && lab.refHigh != null ? ` (source range ${lab.refLow}–${lab.refHigh})` : ''
  if (lab.isAbnormal) {
    return `${lab.name} ${lab.value} ${lab.unit} is outside the source range${range}.`
  }
  return `${lab.name} ${lab.value} ${lab.unit} is inside the source range${range}.`
}

export function composeCharacterSpeech(data: TownSimulationData): Record<string, string> {
  const ownership = data.caseStatus.ownershipState
  const accepted = ownership === 'ACCEPTED'
  const transfer = ownership === 'TRANSFER_REQUESTED'
  const lab = data.patient.recentLab
  const observation = data.patient.observations?.[0]?.detail
  const owner = data.caseStatus.currentOwner

  return {
    'doctor-morgan': accepted
      ? 'Handover accepted. The practice is now responsible.'
      : lab
        ? `${labPhrase(lab)} Needs handing over to the practice.`
        : 'No result held for this patient yet.',
    'lab-tech': lab
      ? `${lab.name} ${lab.value} ${lab.unit} released to the ordering team.`
      : 'No result released for this patient.',
    'duty-gp': accepted
      ? 'Handover accepted. Review booked.'
      : transfer
        ? 'Handover received. Waiting for me to accept it.'
        : 'On call. Nothing accepted on this result yet.',
    'patient-amira': observation
      ? observation
      : accepted
        ? 'Appointment notice received from the practice.'
        : 'Home readings are being sent. Waiting on follow-up.',
    pharmacist: 'Dispensary open. Repeat prescriptions queued.',
    'runner-adk': accepted
      ? 'Loop closed. Confirmed on the receiving record.'
      : transfer
        ? 'Handover in transit to the practice.'
        : `Watching for unfinished work. Currently responsible: ${owner}.`,
  }
}

export function runnerPathFor(ownershipState: string): Point[] {
  if (ownershipState === 'ACCEPTED' || ownershipState === 'TRANSFER_REQUESTED') {
    return RUNNER_TO_GP.map((point) => ({ ...point }))
  }
  return RUNNER_LOOP.map((point) => ({ ...point }))
}

export function stepAlongPath(
  current: Point,
  target: Point,
  speed: number,
): { next: Point; arrived: boolean } {
  const dx = target.x - current.x
  const dy = target.y - current.y
  const dist = Math.hypot(dx, dy)
  if (dist <= speed || dist === 0) {
    return { next: { x: target.x, y: target.y }, arrived: true }
  }
  return {
    next: { x: current.x + (dx / dist) * speed, y: current.y + (dy / dist) * speed },
    arrived: false,
  }
}

export interface Decoration {
  kind: 'tree' | 'pine' | 'bush' | 'lamp' | 'flower'
  x: number
  y: number
}

export const DECORATIONS: Decoration[] = [
  { kind: 'pine', x: 40, y: 40 },
  { kind: 'tree', x: 70, y: 200 },
  { kind: 'tree', x: 500, y: 40 },
  { kind: 'pine', x: 620, y: 180 },
  { kind: 'bush', x: 540, y: 300 },
  { kind: 'lamp', x: 200, y: 348 },
  { kind: 'lamp', x: 620, y: 348 },
  { kind: 'lamp', x: 1320, y: 348 },
  { kind: 'lamp', x: 1680, y: 348 },
  { kind: 'lamp', x: 2240, y: 348 },
  { kind: 'tree', x: 1280, y: 50 },
  { kind: 'pine', x: 1480, y: 160 },
  { kind: 'tree', x: 1720, y: 40 },
  { kind: 'tree', x: 2280, y: 60 },
  { kind: 'pine', x: 2320, y: 240 },
  { kind: 'tree', x: 40, y: 500 },
  { kind: 'bush', x: 420, y: 620 },
  { kind: 'tree', x: 480, y: 720 },
  { kind: 'pine', x: 620, y: 560 },
  { kind: 'lamp', x: 200, y: 828 },
  { kind: 'lamp', x: 620, y: 828 },
  { kind: 'lamp', x: 1320, y: 828 },
  { kind: 'lamp', x: 1680, y: 828 },
  { kind: 'lamp', x: 2240, y: 828 },
  { kind: 'tree', x: 1280, y: 560 },
  { kind: 'tree', x: 1420, y: 700 },
  { kind: 'pine', x: 1600, y: 620 },
  { kind: 'tree', x: 2280, y: 780 },
  { kind: 'flower', x: 200, y: 1340 },
  { kind: 'flower', x: 320, y: 1360 },
  { kind: 'tree', x: 40, y: 1080 },
  { kind: 'pine', x: 420, y: 1180 },
  { kind: 'tree', x: 520, y: 1480 },
  { kind: 'bush', x: 600, y: 1300 },
  { kind: 'lamp', x: 200, y: 1388 },
  { kind: 'lamp', x: 620, y: 1388 },
  { kind: 'lamp', x: 1320, y: 1388 },
  { kind: 'lamp', x: 1680, y: 1388 },
  { kind: 'lamp', x: 2240, y: 1388 },
  { kind: 'tree', x: 1280, y: 1040 },
  { kind: 'pine', x: 1480, y: 1280 },
  { kind: 'tree', x: 1600, y: 1480 },
  { kind: 'tree', x: 2280, y: 1040 },
  { kind: 'pine', x: 2320, y: 1480 },
  { kind: 'flower', x: 980, y: 1080 },
  { kind: 'flower', x: 1180, y: 1100 },
  { kind: 'bush', x: 780, y: 1080 },
]

export const ROADS: Rect[] = [
  { x: 60, y: 360, w: 2280, h: 56 },
  { x: 60, y: 840, w: 2280, h: 56 },
  { x: 60, y: 1400, w: 2280, h: 56 },
  { x: 240, y: 280, w: 56, h: 1180 },
  { x: 980, y: 250, w: 56, h: 1210 },
  { x: 1980, y: 260, w: 56, h: 1200 },
]

export function cameraForBuilding(
  building: BuildingDef,
  zoom: number,
  viewW: number,
  viewH: number,
): Point {
  const cx = building.x + building.width / 2
  const cy = building.y + building.height / 2 - 36
  return clampCamera(cx - viewW / zoom / 2, cy - viewH / zoom / 2, zoom, viewW, viewH)
}

export function defaultCamera(viewW: number, viewH: number): { cam: Point; zoom: number } {
  const zoom = 1.12
  const hospital = BUILDINGS[0]!
  return { cam: cameraForBuilding(hospital, zoom, viewW, viewH), zoom }
}
