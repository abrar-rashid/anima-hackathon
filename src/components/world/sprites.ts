import type { TeamId } from '@/domain/types'
import { P } from './palette'

export type Pixel = { x: number; y: number; w: number; h: number; fill: string }

const KEY: Record<string, string | null> = {
  '.': null,
  i: P.ink,
  k: P.cobble,
  l: P.cobbleLight,
  w: P.water,
  W: P.waterLight,
  b: P.brick,
  B: P.brickDark,
  t: P.tile,
  T: P.tileDark,
  s: P.sage,
  S: P.sageDark,
  c: P.clay,
  C: P.clayDark,
  v: P.violet,
  V: P.violetDark,
  a: P.slate,
  A: P.slateDark,
  u: P.copper,
  U: P.copperDark,
  n: P.linen,
  N: P.linenDark,
  o: P.wood,
  r: P.brass,
  p: P.phosphor,
  d: P.dust,
  m: P.moss,
  g: P.glass,
  y: P.lantern,
}

export function pixelsFromRows(rows: readonly string[], ox: number, oy: number, scale = 3): Pixel[] {
  const out: Pixel[] = []
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y] ?? ''
    let x = 0
    while (x < row.length) {
      const ch = row[x] ?? '.'
      const fill = KEY[ch]
      if (!fill) {
        x += 1
        continue
      }
      let run = 1
      while (x + run < row.length && row[x + run] === ch) run += 1
      out.push({ x: ox + x * scale, y: oy + y * scale, w: run * scale, h: scale, fill })
      x += run
    }
  }
  return out
}

const HOSPITAL = [
  '....bbbbbb....',
  '..bbbbbbbbbb..',
  '.bBBBBBBBBbb.',
  '.bggbggbggbb.',
  '.bbbbbbbbbbb.',
  '.bggbggbggbb.',
  '.bbbbobobbbb.',
  '.kkkkkkkkkkk.',
] as const

const DIAGNOSTICS = [
  '...TTTTTTTT...',
  '.tttttttttttt.',
  '.tggttggttggt.',
  '.tttttttttttt.',
  '.tggttggttggt.',
  '.ttttootttttt.',
  '.kkkkkkkkkkkk.',
] as const

const REFERRALS = [
  '.....aaaa.....',
  '....aAAAaa....',
  '...aagggaaa...',
  '...aaaaaaaa...',
  '...aagggaaa...',
  '..aaaaaaaaaa..',
  '..aoooooooaa..',
  '.kkkkkkkkkkkk.',
] as const

const GP = [
  '..SSSSSSSSSS..',
  '.ssssssssssss.',
  '.sggssssggsss.',
  '.ssssssssssss.',
  '.sggssosggsss.',
  '.mmmmssssmmmm.',
  '.kkkkkkkkkkkk.',
] as const

const COMMUNITY = [
  '...CCCCCCCC...',
  '.cccccccccccc.',
  '.cggccccggccc.',
  '.cccccccccccc.',
  '.cggccooccggc.',
  '.cccccccccccc.',
  '.kkkkkkkkkkkk.',
] as const

const PHARMACY = [
  '....VVVVVV....',
  '..vvvvvvvvvv..',
  '.vvggvvvvggvv.',
  '.vvvvvvvvvvvv.',
  '.vvggvoovggvv.',
  '.vvvvrrvvvvvv.',
  '.kkkkkkkkkkkk.',
] as const

const WEARABLES = [
  '......U.......',
  '....UUUUU.....',
  '..uuuuuuuuuu..',
  '.uugguuuugguu.',
  '.uuuuuuuuuuuu.',
  '.uugguoougguu.',
  '.kkkkkkkkkkkk.',
] as const

const PATIENT = [
  '.....NNNN.....',
  '...nnnnnnnn...',
  '..nnggnnggnn..',
  '..nnnnnnnnnn..',
  '..nnggnoognn..',
  '..nnnnnnnnnn..',
  '.kkkkkkkkkkkk.',
] as const

const DUTY = [
  '....SSSSSS....',
  '..ssssssssss..',
  '.ssggssssggss.',
  '.sssssossssss.',
  '.ssrrssssrrss.',
  '.kkkkkkkkkkkk.',
] as const

const GENERIC = [
  '....llllll....',
  '..llllllllll..',
  '.llggllllggll.',
  '.llllllllllll.',
  '.llggloolggll.',
  '.kkkkkkkkkkkk.',
] as const

const BUILDINGS: Record<string, readonly string[]> = {
  hospital: HOSPITAL,
  diagnostics: DIAGNOSTICS,
  referrals: REFERRALS,
  gp: GP,
  community: COMMUNITY,
  pharmacy: PHARMACY,
  wearables: WEARABLES,
  patient: PATIENT,
  'gp-duty': DUTY,
}

export function buildingPixels(teamId: TeamId | string, ox: number, oy: number): Pixel[] {
  return pixelsFromRows(BUILDINGS[teamId] ?? GENERIC, ox, oy, 3)
}

export function occupancyPlinth(ox: number, oy: number, occupied: boolean): Pixel[] {
  if (!occupied) return []
  return [{ x: ox + 3, y: oy + 24, w: 48, h: 2, fill: P.phosphor }]
}

/** Specimen phial. Fill height encodes direction only — never severity. */
export function phialPixels(
  ox: number,
  oy: number,
  direction: 'above' | 'below',
  rotCount: number,
): Pixel[] {
  const fill = direction === 'above' ? P.above : P.below
  const meniscusY = direction === 'above' ? oy + 6 : oy + 10
  const pixels: Pixel[] = [
    { x: ox + 2, y: oy, w: 6, h: 2, fill: P.cork },
    { x: ox + 1, y: oy + 2, w: 8, h: 2, fill: P.lanternDim },
    { x: ox, y: oy + 4, w: 2, h: 12, fill: P.lanternDim },
    { x: ox + 8, y: oy + 4, w: 2, h: 12, fill: P.lanternDim },
    { x: ox, y: oy + 16, w: 10, h: 2, fill: P.lanternDim },
    { x: ox + 2, y: oy + 4, w: 6, h: 12, fill: P.glass },
    { x: ox + 2, y: meniscusY, w: 6, h: oy + 16 - meniscusY, fill },
  ]
  if (direction === 'above') {
    pixels.push(
      { x: ox + 11, y: oy + 5, w: 2, h: 2, fill: P.above },
      { x: ox + 10, y: oy + 7, w: 4, h: 2, fill: P.above },
    )
  } else {
    pixels.push(
      { x: ox + 10, y: oy + 12, w: 4, h: 2, fill: P.below },
      { x: ox + 11, y: oy + 14, w: 2, h: 2, fill: P.below },
    )
  }
  const rotCells: ReadonlyArray<readonly [number, number]> = [
    [1, 14],
    [3, 15],
    [6, 14],
    [2, 13],
    [7, 12],
    [0, 11],
    [8, 15],
    [4, 14],
    [1, 9],
    [7, 8],
    [2, 16],
    [5, 15],
    [0, 13],
    [8, 10],
    [3, 8],
    [6, 16],
    [1, 7],
    [8, 13],
  ]
  for (let i = 0; i < rotCount && i < rotCells.length; i += 1) {
    const cell = rotCells[i]
    if (!cell) continue
    const [dx, dy] = cell
    pixels.push({ x: ox + dx, y: oy + dy, w: 1, h: 1, fill: i % 2 === 0 ? P.rot : P.moss })
  }
  return pixels
}

export function pendingTrayPixels(ox: number, oy: number): Pixel[] {
  return [
    { x: ox, y: oy, w: 8, h: 1, fill: P.brass },
    { x: ox, y: oy, w: 1, h: 6, fill: P.brass },
    { x: ox + 7, y: oy, w: 1, h: 6, fill: P.brass },
    { x: ox, y: oy + 5, w: 8, h: 1, fill: P.brass },
  ]
}

export function groundPixels(): Pixel[] {
  return [
    { x: 0, y: 0, w: 320, h: 200, fill: P.water },
    { x: 6, y: 6, w: 308, h: 188, fill: P.waterLight },
    { x: 10, y: 10, w: 300, h: 180, fill: P.cobble },
    { x: 10, y: 68, w: 300, h: 2, fill: P.cobbleLight },
    { x: 10, y: 132, w: 300, h: 2, fill: P.cobbleLight },
    { x: 108, y: 10, w: 2, h: 180, fill: P.cobbleLight },
    { x: 210, y: 10, w: 2, h: 180, fill: P.cobbleLight },
    { x: 228, y: 156, w: 82, h: 34, fill: P.water },
    { x: 232, y: 160, w: 74, h: 26, fill: P.waterLight },
  ]
}

export function threadStroke(state: string): { color: string; dash: string; width: number } {
  switch (state) {
    case 'REQUESTED':
      return { color: P.phosphor, dash: '4 3', width: 2 }
    case 'ACCEPTED':
      return { color: P.accepted, dash: 'none', width: 2 }
    case 'DECLINED':
      return { color: P.declined, dash: '6 4', width: 2 }
    case 'OVERDUE':
      return { color: P.brass, dash: '2 3 1 3', width: 2 }
    case 'RECEIVER_UNAVAILABLE':
      return { color: P.lanternDim, dash: '3 5', width: 2 }
    case 'STALE':
      return { color: P.dust, dash: '1 3', width: 1 }
    default:
      return { color: P.lanternDim, dash: 'none', width: 1 }
  }
}
