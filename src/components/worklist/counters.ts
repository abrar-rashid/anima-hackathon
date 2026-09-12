import type { Rate, ScanWindow } from '@/ctl/contracts'
import { formatRateWithWindow, formatScanWindow } from './format'

export interface HeaderCounter {
  id: string
  title: string
  rate: Rate | undefined
  detail: string
}

const COUNTER_SPECS = [
  { id: 'unclosed', title: 'Unclosed tasks', tests: [/unclosed/i] },
  { id: 'breached', title: 'Breached deadlines', tests: [/breach/i] },
  { id: 'awaiting', title: 'Awaiting result', tests: [/awaiting/i] },
  { id: 'handovers', title: 'Unprocessed handovers', tests: [/handover/i] },
] as const

/** Pick the four header rates by label. A miss is shown as absence, never as zero. */
export function headerCounters(rates: Rate[], window: ScanWindow): HeaderCounter[] {
  return COUNTER_SPECS.map((spec) => {
    const rate = rates.find((item) => spec.tests.some((test) => test.test(item.label)))
    return {
      id: spec.id,
      title: spec.title,
      rate,
      detail: rate ? formatRateWithWindow(rate, window) : `not supplied by source · ${formatScanWindow(window)}`,
    }
  })
}
