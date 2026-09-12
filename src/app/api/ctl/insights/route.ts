import { assembleInsights } from '../assemble'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const sourced = await assembleInsights()
  return Response.json(sourced)
}
