import type { CohortEpisode } from "@/lib/ehr/adapter";
import { BOUNDARIES } from "@/lib/ehr/cohort";

export interface BoundaryStat {
  boundary: string;
  label: string;
  n: number;
  crossed: number;
  never_crossed: number;
  never_crossed_pct: number;
  p50: number | null;
  p90: number | null;
  worst: number | null;
  /** Hours of avoidable delay per 100 discharges, the number an ops lead cares about. */
  burden_per_100: number;
}

const LABEL: Record<string, string> = {
  "hospital->gp": "Hospital → GP",
  "gp->pharmacy": "GP → Pharmacy",
  "pharmacy->community": "Pharmacy → Community",
  "community->home": "Community → Home",
};

function pct(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[i] * 10) / 10;
}

export function boundaryStats(cohort: CohortEpisode[]): BoundaryStat[] {
  return BOUNDARIES.map((b) => {
    const values = cohort
      .map((e) => e.boundaries[b])
      .filter((v): v is number => typeof v === "number")
      .sort((a, x) => a - x);
    const never = cohort.filter((e) => e.boundaries[b] === null).length;
    const p50 = pct(values, 50);
    const p90 = pct(values, 90);
    const excess = values.reduce((acc, v) => acc + Math.max(0, v - (p50 ?? 0)), 0);

    return {
      boundary: b,
      label: LABEL[b] ?? b,
      n: cohort.length,
      crossed: values.length,
      never_crossed: never,
      never_crossed_pct: Math.round((never / cohort.length) * 1000) / 10,
      p50,
      p90,
      worst: values.length ? Math.round(values[values.length - 1] * 10) / 10 : null,
      burden_per_100: Math.round((excess / cohort.length) * 100),
    };
  });
}

export interface OpsSummary {
  episodes: number;
  fully_closed: number;
  closure_rate: number;
  total_breaches: number;
  worst_boundary: BoundaryStat | null;
  boundaries: BoundaryStat[];
  /** Distribution buckets for the histogram, per boundary. */
  histogram: { boundary: string; label: string; buckets: { range: string; count: number }[] }[];
}

const BUCKETS: [number, number, string][] = [
  [0, 6, "0-6h"],
  [6, 24, "6-24h"],
  [24, 48, "1-2d"],
  [48, 96, "2-4d"],
  [96, Infinity, "4d+"],
];

export function opsSummary(cohort: CohortEpisode[]): OpsSummary {
  const boundaries = boundaryStats(cohort);
  const worst = [...boundaries].sort(
    (a, b) => b.never_crossed_pct + (b.p90 ?? 0) / 10 - (a.never_crossed_pct + (a.p90 ?? 0) / 10),
  )[0];

  const histogram = boundaries.map((bs) => ({
    boundary: bs.boundary,
    label: bs.label,
    buckets: BUCKETS.map(([lo, hi, range]) => ({
      range,
      count: cohort.filter((e) => {
        const v = e.boundaries[bs.boundary];
        return typeof v === "number" && v >= lo && v < hi;
      }).length,
    })).concat({
      range: "never",
      count: bs.never_crossed,
    }),
  }));

  const fully = cohort.filter((e) => e.closed).length;
  return {
    episodes: cohort.length,
    fully_closed: fully,
    closure_rate: Math.round((fully / cohort.length) * 1000) / 10,
    total_breaches: cohort.reduce((a, e) => a + e.breaches, 0),
    worst_boundary: worst ?? null,
    boundaries,
    histogram,
  };
}
