import { NextResponse } from 'next/server'
import { ApproveResponse, CaseSnapshotResponse } from '@/api/contracts'
import { errorResponse } from '@/services/case-service'
import { getContainer } from '@/services/container'

export const runtime = 'nodejs'

export async function POST(_request: Request, context: { params: Promise<{ caseId: string }> }) {
  try {
    const { caseId } = await context.params
    const result = await getContainer().cases.refresh(caseId)
    const { receipts, ...snapshot } = result
    return NextResponse.json({
      ...CaseSnapshotResponse.parse(snapshot),
      receipts: ApproveResponse.shape.receipts.parse(receipts),
    })
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
