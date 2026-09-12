// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatSimulatorTime } from '@/components/world/format'
import { TimeScrubber } from '@/components/world/TimeScrubber'

afterEach(() => {
  cleanup()
})

describe('TimeScrubber', () => {
  it('shows the supplied simulator time and clock phrase', () => {
    render(
      <TimeScrubber now={1_789_286_400_000} min={1_789_286_400_000} max={1_789_286_400_000} paused speed={60} />,
    )
    expect(screen.getByText('Clock paused at speed 60')).toBeTruthy()
    expect(screen.getByText(new RegExp(formatSimulatorTime(1_789_286_400_000)))).toBeTruthy()
    expect(screen.getByText(/Single recorded frame/)).toBeTruthy()
    expect(screen.getByRole('slider')).toHaveProperty('disabled', true)
  })

  it('emits the chosen simulator time without mutating anything else', () => {
    const onSeek = vi.fn()
    render(
      <TimeScrubber now={10} min={10} max={40} paused={false} speed={2} onSeek={onSeek} />,
    )
    fireEvent.change(screen.getByRole('slider'), { target: { value: '25' } })
    expect(onSeek).toHaveBeenCalledWith(25)
  })
})
