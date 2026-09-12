import { NextResponse } from 'next/server'
import { errorResponse } from '@/services/case-service'
import { getContainer } from '@/services/container'

export const runtime = 'nodejs'

export async function POST(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await context.params
    return NextResponse.json(await getContainer().cases.compile(caseId))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
