import type { CohortEpisode } from "./adapter";

/**
 * Deterministic synthetic cohort for the operational latency view.
 * Seeded PRNG so the numbers are identical on every run and every machine:
 * the ops chart must not move between rehearsal and pitch.
 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Amira", "Joseph", "Nadia", "Errol", "Priya", "Tomasz", "Beatrice", "Musa",
  "Eileen", "Hassan", "Doreen", "Kofi", "Margaret", "Ravi", "Sylvia", "Dawit",
  "Brenda", "Yusuf", "Patricia", "Ibrahim", "Maureen", "Chen", "Gladys", "Omar",
  "Violet", "Sunil", "Edna", "Abebe", "Joan", "Farida", "Leonard", "Anita",
  "Reginald", "Zainab", "Cynthia", "Arjun", "Pauline", "Emeka", "Rosemary", "Tariq",
  "Sheila", "Mehmet",
];
const LAST = [
  "Khatun", "Adeyemi", "Rahman", "Blake", "Shah", "Kowalski", "Mensah", "Diallo",
  "O'Connor", "Farah", "Whitfield", "Asante", "Thompson", "Iyer", "Barnes", "Tesfaye",
  "Hughes", "Karim", "Dunne", "Nasir", "Kelly", "Wang", "Osei", "Haddad",
  "Pritchard", "Nair", "Marsh", "Girma", "Reilly", "Sultana", "Ferreira", "Lynch",
  "Boateng", "Aziz", "Wallace", "Menon", "Doyle", "Okafor", "Gill", "Mahmood",
  "Croft", "Yilmaz",
];

const TRUSTS = [
  "Barts Health NHS Trust",
  "Homerton Healthcare",
  "Newham University Hospital",
  "Whipps Cross",
];

/** The five boundaries the rail measures. Names match the Handoff ids. */
export const BOUNDARIES = [
  "hospital->gp",
  "gp->pharmacy",
  "pharmacy->community",
  "community->home",
] as const;

/**
 * Each boundary has a different underlying reliability. gp->pharmacy is the
 * worst because the Discharge Medicines Service referral is manual, and that
 * is exactly what the ops view should surface.
 */
const PROFILE: Record<string, { median: number; spread: number; failRate: number }> = {
  "hospital->gp": { median: 3.5, spread: 9, failRate: 0.07 },
  "gp->pharmacy": { median: 31, spread: 58, failRate: 0.34 },
  "pharmacy->community": { median: 14, spread: 26, failRate: 0.19 },
  "community->home": { median: 22, spread: 44, failRate: 0.26 },
};

function build(): CohortEpisode[] {
  const rnd = mulberry32(20260912);
  const out: CohortEpisode[] = [];

  for (let i = 0; i < 42; i++) {
    const boundaries: Record<string, number | null> = {};
    let breaches = 0;

    for (const b of BOUNDARIES) {
      const p = PROFILE[b];
      if (rnd() < p.failRate) {
        boundaries[b] = null; // never crossed
        breaches++;
        continue;
      }
      // log-normal-ish: most fast, a long right tail
      const u = rnd();
      const hours = p.median * Math.exp(u * u * 2.1) + rnd() * p.spread * 0.25;
      boundaries[b] = Math.round(hours * 10) / 10;
      if (hours > p.median * 3) breaches++;
    }

    const dischargeDay = 1 + Math.floor(rnd() * 10);
    out.push({
      episode_id: `EPI-2026-${(800 + i).toString()}`,
      patient_name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      discharged_at: `2026-09-${dischargeDay.toString().padStart(2, "0")}T12:00:00Z`,
      boundaries,
      closed: breaches === 0,
      breaches,
      trust: TRUSTS[i % TRUSTS.length],
    });
  }

  // Pin the hero episode into the cohort so the two views agree.
  out[0] = {
    episode_id: "EPI-2026-0844",
    patient_name: "Amira Khatun",
    discharged_at: "2026-09-08T16:40:00Z",
    boundaries: {
      "hospital->gp": 15.2,
      "gp->pharmacy": null,
      "pharmacy->community": null,
      "community->home": null,
    },
    closed: false,
    breaches: 3,
    trust: "Barts Health NHS Trust",
  };

  return out;
}

export const COHORT: CohortEpisode[] = build();
