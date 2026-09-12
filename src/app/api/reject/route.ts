import { rejectEscalation } from "@/lib/store/actions";

export async function POST(req: Request) {
  const { obligation_id, reason } = (await req.json()) as { obligation_id: string; reason: string };
  try {
    return Response.json(rejectEscalation(obligation_id, reason ?? "No reason given"));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
