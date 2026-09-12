import type { AnimaClient } from '@/adapters/anima/client'
import type { SimulatorClock } from '@/ports/anima-read-port'
import type { ClockReceipt, SimulatorClockPort } from '@/ports/clock-port'

interface ClockBody {
  now?: number
  paused?: boolean
  speed?: number
}

export class AnimaClockAdapter implements SimulatorClockPort {
  constructor(private readonly client: AnimaClient) {}

  async read(): Promise<SimulatorClock> {
    const { status, body } = await this.client.request<ClockBody>('/api/clock')
    if (status !== 200) throw new Error(`Anima clock read failed: ${status}`)
    return { now: body.now ?? 0, paused: Boolean(body.paused), speed: body.speed ?? 0 }
  }

  async advanceApproved(minutes: 10 | 30 | 90): Promise<ClockReceipt> {
    const { status, body } = await this.client.request<ClockBody>('/api/clock', {
      method: 'POST',
      body: JSON.stringify({ paused: true, advanceMinutes: minutes }),
    })
    if (status !== 200) throw new Error(`Anima clock advance failed: ${status}`)
    return {
      now: body.now ?? 0,
      paused: Boolean(body.paused),
      advancedMinutes: minutes,
    }
  }
}
