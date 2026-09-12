import { NextResponse } from 'next/server'
import { getContainer } from '@/services/container'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { advanceMinutes?: number }
    const allowed = [10, 30, 90] as const
    const minutes = allowed.includes(body.advanceMinutes as 10 | 30 | 90)
      ? (body.advanceMinutes as 10 | 30 | 90)
      : 30

    const container = getContainer()
    const receipt = await container.clock.advanceApproved(minutes)

    return NextResponse.json({
      ok: true,
      receipt,
      now: receipt.now,
      advancedMinutes: receipt.advancedMinutes,
    })
  } catch (error) {
    console.error('Failed to advance simulation clock:', error)
    return NextResponse.json(
      { error: 'failed_to_advance_clock', message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
