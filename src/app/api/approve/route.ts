import { approveEscalation } from "@/lib/store/actions";

export async function POST(req: Request) {
  const { obligation_id, message } = (await req.json()) as {
    obligation_id: string;
    message?: string;
  };
  try {
    return Response.json(approveEscalation(obligation_id, message));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
