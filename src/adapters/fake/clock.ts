import type { SimulatorClock } from '@/ports/anima-read-port'
import type { ClockReceipt, SimulatorClockPort } from '@/ports/clock-port'

export class FakeClock implements SimulatorClockPort {
  readonly state: SimulatorClock

  constructor(state: SimulatorClock = { now: 1789286400000, paused: true, speed: 0 }) {
    this.state = { now: state.now, paused: state.paused, speed: state.speed }
  }

  async read(): Promise<SimulatorClock> {
    return { now: this.state.now, paused: this.state.paused, speed: this.state.speed }
  }

  async advanceApproved(minutes: 10 | 30 | 90): Promise<ClockReceipt> {
    this.state.now += minutes * 60 * 1000
    this.state.paused = true
    return { now: this.state.now, paused: this.state.paused, advancedMinutes: minutes }
  }
}
