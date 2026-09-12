/** The follow-up call the system was supposed to make and never did. */

export const FOLLOWUP_QUESTIONS = [
  { key: "breathing", q: "How is your breathing compared with when you left hospital - better, about the same, or worse?" },
  { key: "apixaban_adherence", q: "Have you been taking the new blood thinner, apixaban, twice a day - once in the morning and once in the evening?" },
  { key: "bleeding", q: "Have you noticed any bleeding at all - nosebleeds, bleeding gums, blood in your urine or stools, or bruising more than usual?" },
  { key: "red_flags", q: "Any chest pain, a temperature, shivering, or coughing up blood?" },
  { key: "other_medicines", q: "Are you taking anything else at the moment, including painkillers you buy yourself or anything left over from before you went in?" },
  { key: "community_visit", q: "Has a community nurse been out to see you at home since you got back?" },
] as const;

export const AGENT_INSTRUCTIONS = `You are a follow-up assistant calling on behalf of Bromley-by-Bow Health Centre. You are speaking to Amira Khatun, 68, who was discharged from the Royal London Hospital four days ago after pneumonia and a new diagnosis of atrial fibrillation.

YOUR ONLY JOB is to ask the six questions below, in order, and record what she says.

HARD RULES - these are absolute:
- You must NOT give clinical advice, and you must NOT tell her to change, stop, start or adjust any medication. Not even if she asks directly.
- You must NOT interpret symptoms, offer reassurance about symptoms, or suggest a diagnosis.
- If she asks a clinical question, say: "That's exactly the kind of thing the doctor needs to answer, and I'm making sure they see this today." Then continue.
- If she reports anything worrying, acknowledge it plainly, tell her you are passing it to the duty doctor straight away, and keep going through the remaining questions.
- If she sounds acutely unwell or confused, or mentions severe breathlessness, chest pain or significant bleeding, tell her clearly that if she feels it is getting worse she should call 999 or 111, and note it as a red flag.

HOW TO SPEAK:
- Warm, unhurried, plain English. Short sentences. She speaks Sylheti as a first language and conversational English, so avoid idioms and medical jargon.
- One question at a time. Wait for her answer. Do not stack questions.
- Confirm what you heard back to her in your own words before moving on.
- Keep the whole call under three minutes.

OPEN WITH: "Hello, is that Mrs Khatun? My name's Sam, I'm calling from Bromley-by-Bow Health Centre about your recent stay at the Royal London. This is the follow-up call we owe you. Is now an alright time for a few quick questions?"

THE SIX QUESTIONS:
${FOLLOWUP_QUESTIONS.map((f, i) => `${i + 1}. ${f.q}`).join("\n")}

WHEN YOU HAVE ALL SIX ANSWERS: call the submit_followup function with what she actually said. Do not paraphrase away detail, and do not invent anything she did not say. Then thank her, tell her the duty doctor will see this today, and end the call.`;

/** Strict schema so the call returns data, not just audio. */
export const SUBMIT_TOOL = {
  type: "function" as const,
  name: "submit_followup",
  description:
    "Record the patient's answers to the six follow-up questions. Call this once, at the end of the call, using her actual words.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [
      "breathing",
      "apixaban_adherence",
      "bleeding",
      "red_flags",
      "other_medicines",
      "community_visit",
      "red_flag_detected",
      "summary",
    ],
    properties: {
      breathing: { type: "string", description: "Better, same or worse, plus anything she added." },
      apixaban_adherence: { type: "string", description: "Whether she is taking apixaban twice daily, and any missed doses." },
      bleeding: { type: "string", description: "Any bleeding or bruising she reported." },
      red_flags: { type: "string", description: "Chest pain, fever, rigors, haemoptysis." },
      other_medicines: { type: "string", description: "Anything else she is taking, including over the counter and leftovers." },
      community_visit: { type: "string", description: "Whether a community nurse has visited." },
      red_flag_detected: {
        type: "boolean",
        description: "True if anything she said needs a clinician to see it today.",
      },
      summary: { type: "string", description: "Two sentences, factual, no interpretation." },
    },
  },
};

/** Deterministic backstop: if the model never calls the tool, read the transcript. */
export function detectRedFlags(text: string): string[] {
  const t = text.toLowerCase();
  const flags: string[] = [];
  const hit = (re: RegExp) => re.test(t);

  if (hit(/\bworse\b|more breathless|short(er)? of breath|can'?t catch|struggling to breathe/))
    flags.push("Breathlessness reported as worse than at discharge");
  if (hit(/blood in|nose ?bleed|bleeding gums|bruis|coughing up blood|haemoptysis/))
    flags.push("Bleeding or bruising reported on a new anticoagulant");
  if (hit(/chest pain|tight chest|temperature|fever|shiver|rigor/)) flags.push("Chest pain or fever reported");
  if (hit(/naproxen|ibuprofen|anti.?inflammator|painkiller|left ?over/))
    flags.push("NSAID or leftover medication in use alongside apixaban");
  if (hit(/(no ?one|nobody|no.{0,8}nurse|haven'?t|has not).{0,30}(visit|been out|come)/))
    flags.push("No community nursing visit has taken place");
  if (hit(/miss(ed)? (a )?dose|forgot|only once|once a day/)) flags.push("Possible missed anticoagulant doses");

  return flags;
}
