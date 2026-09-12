import { NextResponse } from 'next/server'
import { ApproveRequest, ApproveResponse } from '@/api/contracts'
import { errorResponse } from '@/services/case-service'
import { getContainer } from '@/services/container'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await context.params
    const body = ApproveRequest.parse(await request.json())
    return NextResponse.json(ApproveResponse.parse(await getContainer().cases.approve(caseId, body)))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
