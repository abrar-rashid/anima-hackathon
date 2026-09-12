import { NextResponse } from 'next/server'
import { getContainer } from '@/services/container'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * The agent's proposal for one patient.
 *
 * Split out from /api/simulation/live because opening a case runs the ADK
 * sequence through a language model and takes about seven and a half seconds.
 * Keeping it separate lets the clinical view paint from records immediately and
 * show the agent working, rather than holding the whole page on a model call.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const patientId = searchParams.get('patientId') ?? 'SIM-000001'

  try {
    const container = getContainer()
    const snapshot = await container.cases.open({ patientId })
    const stored = container.store.get(snapshot.case.caseId)
    if (stored) snapshot.case = stored.case
    return NextResponse.json({ ok: true, caseSnapshot: snapshot })
  } catch (error) {
    // A failed proposal must not blank the clinical view: the records the
    // clinician needs were already delivered by /api/simulation/live.
    return NextResponse.json({
      ok: false,
      caseSnapshot: null,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
