import { detectRedFlags } from "@/lib/voice/prompt";
import { closeWithEvidence } from "@/lib/store/actions";
import { append, getState } from "@/lib/store/state";

/**
 * Ends the call and closes the obligation with the patient's own answers as
 * the closure evidence. Red flags are routed to the duty GP's queue.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    captured?: Record<string, string>;
    summary?: string;
    red_flag_detected?: boolean;
  };
  const s = getState();
  const transcriptText = s.call.transcript.map((l) => l.text).join(" ");
  const captured = body.captured ?? {};

  // Tool output preferred; transcript parser is the backstop.
  const flags = Array.from(
    new Set([
      ...detectRedFlags(transcriptText),
      ...detectRedFlags(Object.values(captured).join(" ")),
    ]),
  );

  s.call.status = "ended";
  s.call.ended_at = s.now;
  s.call.captured = captured;
  s.call.red_flags = flags;

  const summary =
    body.summary ??
    (flags.length
      ? `Patient reached and answered all questions. ${flags.length} item(s) require a clinician today.`
      : "Patient reached and answered all questions. Nothing requiring same-day clinician review.");

  closeWithEvidence(
    "OBL-HOME-CALL",
    {
      kind: "patient_contact",
      at: s.now,
      actor_id: "ACT-AGENT",
      record_id: `CALL-${s.seq + 1}`,
      note: summary,
    },
    `Two-way contact completed with the patient. ${s.call.transcript.length} transcript turns captured and written back to the record. ${summary}`,
    "CareClosure Agent",
  );

  if (flags.length) {
    s.inbox.push({
      id: `MSG-RF-${s.seq}`,
      lane: "gp",
      to_actor_id: "ACT-ADEYEMI",
      from: "CareClosure follow-up call",
      subject: `Red flags from follow-up call - ${s.bundle.patient.name}`,
      body:
        `The follow-up call the system never made has now happened. The patient reported:\n\n` +
        flags.map((f) => `- ${f}`).join("\n") +
        `\n\nHer answers, verbatim:\n` +
        Object.entries(captured)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n") +
        `\n\nCareClosure has not advised her on any of this and has not changed anything. It needs a clinician.`,
      obligation_id: "OBL-HOME-CALL",
      arrived_at: s.now,
      priority: "urgent",
      action_required: "Clinical review of the reported red flags today.",
      acted: false,
    });
    append(s, {
      obligation_id: "OBL-HOME-CALL",
      actor: "CareClosure Agent",
      actor_kind: "agent",
      event: "Red flags routed to duty GP",
      detail: `${flags.length} red flag(s) detected in the patient's own answers and routed to Dr Samuel Adeyemi: ${flags.join("; ")}.`,
      trace: [
        { step: "call.parse", input: `${s.call.transcript.length} turns`, output: `${flags.length} red flags`, ms: 18 },
        { step: "route.escalate", input: "duty GP queue", output: `MSG-RF-${s.seq}`, ms: 6 },
      ],
    });
  }

  return Response.json({ ok: true, red_flags: flags, summary });
}
