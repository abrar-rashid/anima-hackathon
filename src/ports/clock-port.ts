import type { SimulatorClock } from '@/ports/anima-read-port'

export interface ClockReceipt {
  now: number
  paused: boolean
  advancedMinutes: number
}

export interface SimulatorClockPort {
  read(): Promise<SimulatorClock>
  advanceApproved(minutes: 10 | 30 | 90): Promise<ClockReceipt>
}
