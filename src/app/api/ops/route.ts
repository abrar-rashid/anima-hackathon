import { getAdapter } from "@/lib/ehr/adapter";
import { opsSummary } from "@/lib/engine/latency";

export async function GET() {
  const cohort = await getAdapter().getCohort();
  return Response.json({ summary: opsSummary(cohort), cohort, source: getAdapter().name });
}
