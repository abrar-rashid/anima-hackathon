import type { TeamId } from '@/domain/types'

export const ATLAS = {
  width: 320,
  height: 200,
  unit: 8,
} as const

export type Plot = { x: number; y: number; w: number; h: number }

const PLOTS: Record<string, Plot> = {
  hospital: { x: 12, y: 12, w: 92, h: 56 },
  diagnostics: { x: 114, y: 12, w: 92, h: 56 },
  referrals: { x: 216, y: 12, w: 92, h: 56 },
  gp: { x: 12, y: 76, w: 92, h: 56 },
  community: { x: 114, y: 76, w: 92, h: 56 },
  pharmacy: { x: 216, y: 76, w: 92, h: 56 },
  wearables: { x: 12, y: 140, w: 92, h: 56 },
  patient: { x: 114, y: 140, w: 92, h: 56 },
  'gp-duty': { x: 216, y: 140, w: 92, h: 56 },
}

const UNKNOWN_PLOT: Plot = { x: 216, y: 140, w: 92, h: 56 }

export function plotFor(teamId: TeamId | string): Plot {
  return PLOTS[teamId] ?? UNKNOWN_PLOT
}

export function districtCenter(teamId: TeamId | string): { x: number; y: number } {
  const plot = plotFor(teamId)
  return {
    x: Math.round(plot.x + plot.w / 2),
    y: Math.round(plot.y + 22),
  }
}

export function entityAnchor(
  teamId: TeamId | string,
  index: number,
): { x: number; y: number } {
  const plot = plotFor(teamId)
  return {
    x: plot.x + 70,
    y: plot.y + 10 + index * 18,
  }
}

export function pendingAnchor(
  teamId: TeamId | string,
  index: number,
): { x: number; y: number } {
  const plot = plotFor(teamId)
  return {
    x: plot.x + 4,
    y: plot.y + 36 + index * 8,
  }
}
