"use client";

import { FOLLOWUP_QUESTIONS } from "./prompt";

export interface CallHandlers {
  onStatus: (s: "connecting" | "ringing" | "live" | "ended" | "failed", mode?: "realtime" | "scripted") => void;
  onLine: (role: "agent" | "patient", text: string, partial?: boolean) => void;
  onCaptured: (captured: Record<string, string>, summary: string, redFlag: boolean) => void;
  onError: (msg: string) => void;
}

async function post(path: string, body: unknown) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}

export interface ActiveCall {
  hangUp: () => void;
  mode: "realtime" | "scripted";
}

export async function startCall(h: CallHandlers): Promise<ActiveCall> {
  h.onStatus("connecting");
  const start = await post("/api/voice/start", {});

  if (start.mode === "scripted") {
    if (start.reason) h.onError(`Live voice unavailable: ${start.reason}. Running simulated patient.`);
    return runScripted(h);
  }
  try {
    return await runRealtime(start.client_secret as string, start.model as string, h);
  } catch (e) {
    h.onError(`Live session failed (${(e as Error).message}). Falling back to simulated patient.`);
    return runScripted(h);
  }
}

/* ------------------------------------------------------------------ realtime */

async function runRealtime(clientSecret: string, model: string, h: CallHandlers): Promise<ActiveCall> {
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
  };

  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
  mic.getTracks().forEach((t) => pc.addTrack(t, mic));

  const dc = pc.createDataChannel("oai-events");
  let agentBuf = "";

  const cleanup = () => {
    mic.getTracks().forEach((t) => t.stop());
    pc.close();
  };

  dc.addEventListener("open", () => {
    h.onStatus("live", "realtime");
    void post("/api/voice/event", { status: "live" });
    // Ask for input transcription so we can show what the patient said.
    dc.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          audio: { input: { transcription: { model: "gpt-4o-mini-transcribe" } } },
        },
      }),
    );
    dc.send(JSON.stringify({ type: "response.create" }));
  });

  dc.addEventListener("message", (ev) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(ev.data as string);
    } catch {
      return;
    }
    const type = msg.type as string;

    if (type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") {
      agentBuf += (msg.delta as string) ?? "";
      h.onLine("agent", agentBuf, true);
    } else if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
      const text = ((msg.transcript as string) ?? agentBuf).trim();
      agentBuf = "";
      if (text) {
        h.onLine("agent", text);
        void post("/api/voice/event", { line: { role: "agent", text } });
      }
    } else if (type === "conversation.item.input_audio_transcription.completed") {
      const text = ((msg.transcript as string) ?? "").trim();
      if (text) {
        h.onLine("patient", text);
        void post("/api/voice/event", { line: { role: "patient", text } });
      }
    } else if (type === "response.function_call_arguments.done" || type === "response.output_item.done") {
      const item = msg.item as { type?: string; name?: string; arguments?: string } | undefined;
      const name = (msg.name as string) ?? item?.name;
      const args = (msg.arguments as string) ?? item?.arguments;
      if (name === "submit_followup" && args) {
        try {
          const parsed = JSON.parse(args) as Record<string, string> & {
            summary?: string;
            red_flag_detected?: boolean;
          };
          const { summary, red_flag_detected, ...captured } = parsed;
          h.onCaptured(captured as Record<string, string>, summary ?? "", !!red_flag_detected);
        } catch {
          /* the server-side transcript parser will still catch red flags */
        }
      }
    } else if (type === "error") {
      h.onError(JSON.stringify(msg.error ?? msg).slice(0, 200));
    }
  });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  h.onStatus("ringing", "realtime");

  const res = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
    body: offer.sdp,
  });
  if (!res.ok) {
    cleanup();
    throw new Error(`SDP exchange ${res.status}`);
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });

  return {
    mode: "realtime",
    hangUp: () => {
      cleanup();
      h.onStatus("ended", "realtime");
    },
  };
}

/* ------------------------------------------------------------------ scripted */

/**
 * The same call against a simulated patient. Uses the browser's own speech
 * synthesis so it is still audible in a room, with no external dependency.
 * Her answers are written to confirm three of the exceptions the rail found.
 */
const SCRIPT: { role: "agent" | "patient"; text: string; pause: number }[] = [
  { role: "agent", text: "Hello, is that Mrs Khatun? My name's Sam, I'm calling from Bromley-by-Bow Health Centre about your recent stay at the Royal London. This is the follow-up call we owe you. Is now an alright time for a few quick questions?", pause: 900 },
  { role: "patient", text: "Yes, yes. That is fine. I was wondering if somebody would ring.", pause: 700 },
  { role: "agent", text: FOLLOWUP_QUESTIONS[0].q, pause: 900 },
  { role: "patient", text: "It is worse, I think. Since yesterday I get out of breath just going to the kitchen. In the hospital I was better than this.", pause: 900 },
  { role: "agent", text: "Thank you for telling me. Worse since yesterday, and breathless walking to the kitchen. I am writing that down for the doctor.", pause: 700 },
  { role: "agent", text: FOLLOWUP_QUESTIONS[1].q, pause: 900 },
  { role: "patient", text: "The new one, yes. Morning and night. Though on Thursday I only took it once, I forgot in the evening.", pause: 800 },
  { role: "agent", text: FOLLOWUP_QUESTIONS[2].q, pause: 900 },
  { role: "patient", text: "My gums bleed a bit when I brush. And there is a big bruise on my arm, I do not remember hitting it.", pause: 900 },
  { role: "agent", text: FOLLOWUP_QUESTIONS[3].q, pause: 900 },
  { role: "patient", text: "No chest pain. I was hot in the night and shivering, but it passed.", pause: 800 },
  { role: "agent", text: FOLLOWUP_QUESTIONS[4].q, pause: 900 },
  { role: "patient", text: "Only my knee tablets. The naproxen. I have been taking those for the knee, same as always.", pause: 900 },
  { role: "agent", text: FOLLOWUP_QUESTIONS[5].q, pause: 900 },
  { role: "patient", text: "No. Nobody has come. They said at the hospital a nurse would visit but no one has been.", pause: 900 },
  { role: "agent", text: "Thank you Mrs Khatun, that is everything I needed. I am not able to advise you on any of this myself, but I am sending all of it to the duty doctor now and they will see it today. If your breathing gets worse before they call, please ring 111, or 999 if it is severe.", pause: 600 },
];

const CAPTURED = {
  breathing: "Worse since yesterday. Breathless walking to the kitchen, says she was better in hospital.",
  apixaban_adherence: "Taking apixaban morning and night, but missed the evening dose on Thursday.",
  bleeding: "Gums bleed when brushing. Unexplained large bruise on her arm.",
  red_flags: "No chest pain. Felt hot and shivery overnight, self-limiting.",
  other_medicines: "Still taking her own naproxen for knee pain, as before admission.",
  community_visit: "No community nurse has visited since discharge.",
};

function speak(text: string, role: "agent" | "patient"): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const pick = (names: string[]) => voices.find((v) => names.some((n) => v.name.includes(n)));
    u.voice = role === "agent" ? pick(["Daniel", "Google UK English Male", "Male"]) ?? voices[0] : pick(["Fiona", "Google UK English Female", "Female", "Samantha"]) ?? voices[1] ?? voices[0];
    u.rate = role === "agent" ? 1.0 : 0.95;
    u.pitch = role === "agent" ? 1.0 : 1.05;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
    // Safety net: never hang the demo on a stalled utterance.
    setTimeout(resolve, Math.min(12000, 90 * text.length));
  });
}

function runScripted(h: CallHandlers): ActiveCall {
  let cancelled = false;
  h.onStatus("ringing", "scripted");

  (async () => {
    await new Promise((r) => setTimeout(r, 1400));
    if (cancelled) return;
    h.onStatus("live", "scripted");
    void post("/api/voice/event", { status: "live" });

    for (const line of SCRIPT) {
      if (cancelled) return;
      h.onLine(line.role, line.text);
      void post("/api/voice/event", { line: { role: line.role, text: line.text } });
      await speak(line.text, line.role);
      await new Promise((r) => setTimeout(r, line.pause));
    }
    if (cancelled) return;
    h.onCaptured(CAPTURED, "Patient reached and answered all six questions. Multiple items need a clinician today.", true);
  })();

  return {
    mode: "scripted",
    hangUp: () => {
      cancelled = true;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
      h.onStatus("ended", "scripted");
    },
  };
}
