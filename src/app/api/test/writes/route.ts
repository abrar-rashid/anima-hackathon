import { NextResponse } from 'next/server'
import { getContainer } from '@/services/container'

export const runtime = 'nodejs'

export async function GET() {
  if (process.env.COVENANT_FAKE_PORTS !== '1') {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }
  return NextResponse.json({ count: getContainer().write.calls.length })
}
