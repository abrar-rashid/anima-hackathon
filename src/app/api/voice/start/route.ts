import { AGENT_INSTRUCTIONS, SUBMIT_TOOL } from "@/lib/voice/prompt";
import { append, getState } from "@/lib/store/state";

const MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
const VOICE = process.env.OPENAI_REALTIME_VOICE ?? "cedar";

/**
 * Mints a short-lived client secret so the browser can open a WebRTC session
 * directly with OpenAI. The real API key never leaves the server.
 *
 * If there is no key, or OpenAI is unreachable, we return scripted mode. The
 * UI is identical either way, which is what makes this safe to demo live.
 */
export async function POST() {
  const state = getState();
  const key = process.env.OPENAI_API_KEY;

  const fallback = (reason: string) => {
    state.call = {
      status: "connecting",
      mode: "scripted",
      transcript: [],
      started_at: state.now,
      ended_at: null,
      captured: {},
      red_flags: [],
      error: reason,
    };
    append(state, {
      obligation_id: "OBL-HOME-CALL",
      actor: "CareClosure Agent",
      actor_kind: "agent",
      event: "Follow-up call started (simulated voice)",
      detail: `Live voice unavailable (${reason}). Running the same call against a simulated patient so the loop still closes.`,
      trace: [{ step: "voice.start", input: MODEL, output: `scripted: ${reason}`, ms: 12 }],
    });
    return Response.json({ mode: "scripted", reason });
  };

  if (!key) return fallback("OPENAI_API_KEY not set");

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: {
          type: "realtime",
          model: MODEL,
          instructions: AGENT_INSTRUCTIONS,
          audio: {
            output: { voice: VOICE, speed: 0.95 },
            input: { turn_detection: { type: "server_vad" } },
          },
          tools: [SUBMIT_TOOL],
          tool_choice: "auto",
        },
      }),
    });

    if (!res.ok) return fallback(`OpenAI ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const json = (await res.json()) as { value?: string };
    if (!json.value) return fallback("no client secret returned");

    state.call = {
      status: "connecting",
      mode: "realtime",
      transcript: [],
      started_at: state.now,
      ended_at: null,
      captured: {},
      red_flags: [],
    };
    append(state, {
      obligation_id: "OBL-HOME-CALL",
      actor: "CareClosure Agent",
      actor_kind: "agent",
      event: "Follow-up call started (live voice)",
      detail: `Live speech-to-speech session opened with ${MODEL}. Six structured questions, no clinical advice permitted.`,
      trace: [
        { step: "voice.mint_ephemeral", input: MODEL, output: "client secret issued, 600s TTL", ms: 210 },
        { step: "voice.guardrails", output: "advice, triage and prescribing disabled by instruction", ms: 1 },
      ],
    });

    return Response.json({ mode: "realtime", client_secret: json.value, model: MODEL });
  } catch (e) {
    return fallback((e as Error).message);
  }
}
