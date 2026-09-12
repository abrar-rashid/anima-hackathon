import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeCallLog } from '@/services/container'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('container', () => {
  it('selects fake ports only when COVENANT_FAKE_PORTS=1', async () => {
    vi.stubEnv('COVENANT_FAKE_PORTS', '1')
    const { getContainer, resetContainer } = await import('@/services/container')
    resetContainer()
    const container = getContainer()
    expect(container.mode).toBe('fake')
    expect(container.live).toBe(false)
    expect(writeCallLog(container.write)).toEqual([])
    expect(container.acceptSupported).toBe(true)
    expect(container.replay).toBeNull()
  })

  it('labels recorded replay only behind the explicit opt-in flag', async () => {
    vi.stubEnv('COVENANT_RECORDED_REPLAY', '1')
    const { getContainer, resetContainer } = await import('@/services/container')
    resetContainer()
    const container = getContainer()
    expect(container.mode).toBe('replay')
    expect(container.replay?.label).toBe('Recorded simulator replay')
    expect(container.replay?.world).toBe('team-ea32f6302052')
    expect(container.replay?.capturedAt.length).toBeGreaterThan(0)
    expect(container.live).toBe(false)
  })

  it('defaults to the live adapter path and does not silently become fake', async () => {
    vi.stubEnv('COVENANT_FAKE_PORTS', '')
    vi.stubEnv('COVENANT_RECORDED_REPLAY', '')
    vi.stubEnv('ANIMA_SIM_API_KEY', 'test-key-not-for-product')
    const { getContainer, resetContainer } = await import('@/services/container')
    resetContainer()
    const container = getContainer()
    expect(container.mode).toBe('live')
    expect(container.live).toBe(true)
    expect(container.replay).toBeNull()
    expect(container.write.constructor.name).toBe('AnimaWriteAdapter')
    expect(container.write).not.toHaveProperty('calls')
  })
})
