import { getState } from "@/lib/store/state";

/** Transcript lines and status changes streamed up from the browser session. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    status?: "connecting" | "ringing" | "live" | "ended" | "failed";
    line?: { role: "agent" | "patient"; text: string };
    error?: string;
  };
  const s = getState();
  if (body.status) s.call.status = body.status;
  if (body.error) s.call.error = body.error;
  if (body.line?.text?.trim()) {
    s.call.transcript.push({ ...body.line, at: new Date().toISOString() });
  }
  return Response.json({ ok: true, lines: s.call.transcript.length });
}
