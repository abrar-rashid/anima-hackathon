import { assemblePatientLoop } from '@/components/patient/assemble'
import type { PatientLoopSourced } from '@/components/patient/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Last successful read per patient, served when a re-read fails outright. */
const lastByPatient = new Map<string, PatientLoopSourced>()

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ patientId: string }> },
): Promise<Response> {
  const { patientId } = await params

  try {
    const data = await assemblePatientLoop(patientId)
    const sourced: PatientLoopSourced = { data, fetchedAt: Date.now(), stale: false }
    if (data.resources.length > 0 || data.patient) {
      lastByPatient.set(patientId, sourced)
    }
    return Response.json(sourced)
  } catch (error) {
    const previous = lastByPatient.get(patientId)
    if (previous) {
      return Response.json({
        data: previous.data,
        fetchedAt: previous.fetchedAt,
        stale: true,
        error: messageFrom(error),
      } satisfies PatientLoopSourced)
    }
    return Response.json(
      {
        error: 'assemble failed',
        detail: messageFrom(error),
      },
      { status: 502 },
    )
  }
}
