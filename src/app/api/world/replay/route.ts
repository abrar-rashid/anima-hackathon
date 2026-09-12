import { NextResponse } from 'next/server'
import { errorResponse } from '@/services/case-service'
import { assembleReplayComparison } from '../assemble-replay'

export const runtime = 'nodejs'

/**
 * Separate resource from GET /api/world: this is an immutable fixture replay,
 * not the live store+clock projection. Caching and failure modes differ.
 */
export async function GET() {
  try {
    return NextResponse.json(assembleReplayComparison())
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
