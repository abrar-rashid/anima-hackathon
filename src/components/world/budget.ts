/**
 * Performance budget for the Phosphor Borough Atlas.
 * Motion is CSS-only. There is no requestAnimationFrame loop.
 */
export const WORLD_PERF_BUDGET = {
  maxSvgNodes: 1200,
  maxJsdomRenderMs: 160,
  jsFrameCostWhenPausedMs: 0,
  animatedProperty: 'stroke-dashoffset on REQUESTED threads only',
} as const
