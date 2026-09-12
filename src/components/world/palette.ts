/**
 * Phosphor Borough Atlas — committed night-watch palette.
 * Direction colours encode only above/below the source-supplied range.
 * They are never a severity, urgency, or triage rank.
 */
export const P = {
  ink: '#100e16',
  lantern: '#f3e6c4',
  lanternDim: '#c4b48a',
  brass: '#c4a35a',
  phosphor: '#d6e37a',
  phosphorDim: '#6e7540',
  brick: '#8f4d3c',
  brickDark: '#5a2e28',
  tile: '#3d6b6a',
  tileDark: '#244544',
  sage: '#4f6b4a',
  sageDark: '#2e3f2c',
  clay: '#b56a3e',
  clayDark: '#7a3f22',
  violet: '#5a4a72',
  violetDark: '#352a46',
  slate: '#3e4d5c',
  slateDark: '#24303a',
  copper: '#9a5a3a',
  copperDark: '#5c3220',
  linen: '#d8cbb0',
  linenDark: '#8a7a60',
  cobble: '#2a2833',
  cobbleLight: '#3a3846',
  water: '#1a2430',
  waterLight: '#243448',
  dust: '#6a5c4e',
  rot: '#3d2a22',
  moss: '#3d5c45',
  above: '#7f93a8',
  below: '#a89068',
  glass: '#1c1a22',
  accepted: '#7ea87a',
  declined: '#8a6a6a',
  wood: '#4a3224',
  cork: '#8b5a2b',
} as const

export type PaletteName = keyof typeof P
