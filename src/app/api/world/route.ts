import { NextResponse } from 'next/server'
import { errorResponse } from '@/services/case-service'
import { assembleLiveSnapshot } from './assemble-live'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const snapshot = await assembleLiveSnapshot()
    return NextResponse.json({ snapshot })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
