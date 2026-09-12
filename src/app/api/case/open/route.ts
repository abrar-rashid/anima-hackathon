import { NextResponse } from 'next/server'
import { OpenCaseRequest } from '@/api/contracts'
import { errorResponse } from '@/services/case-service'
import { getContainer } from '@/services/container'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const raw: unknown = await request.json().catch(() => ({}))
    const body = OpenCaseRequest.parse(raw)
    const snapshot = await getContainer().cases.open(body)
    return NextResponse.json(snapshot)
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
