import { actOnInboxItem } from "@/lib/store/actions";

export async function POST(req: Request) {
  const { message_id, note, actor_id } = (await req.json()) as {
    message_id: string;
    note: string;
    actor_id: string;
  };
  try {
    return Response.json(actOnInboxItem(message_id, note, actor_id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
