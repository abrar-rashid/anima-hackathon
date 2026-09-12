import type { EhrBundle } from "@/lib/types";
import { AMIRA } from "./amira";
import { COHORT } from "./cohort";

/**
 * THE SWAP SEAM.
 *
 * Everything downstream (extraction, obligations, rail, exceptions, latency)
 * consumes an EhrBundle and nothing else. To move from synthetic data to the
 * Anima simulator, implement this interface and change one line in getAdapter().
 * No engine or UI code changes.
 */
export interface EhrAdapter {
  readonly name: string;
  listEpisodes(): Promise<{ episode_id: string; patient_name: string }[]>;
  getEpisode(episodeId: string): Promise<EhrBundle | null>;
  /** Cohort-level step latencies for the operational view. */
  getCohort(): Promise<CohortEpisode[]>;
}

export interface CohortEpisode {
  episode_id: string;
  patient_name: string;
  discharged_at: string;
  /** hours spent at each named boundary; null means never crossed */
  boundaries: Record<string, number | null>;
  closed: boolean;
  breaches: number;
  trust: string;
}

class MockAdapter implements EhrAdapter {
  readonly name = "Synthetic NHS record set (5 source systems)";

  async listEpisodes() {
    return [{ episode_id: AMIRA.episode_id, patient_name: AMIRA.patient.name }];
  }

  async getEpisode(episodeId: string) {
    return episodeId === AMIRA.episode_id ? AMIRA : null;
  }

  async getCohort() {
    return COHORT;
  }
}

/**
 * Anima simulator adapter. Fill in once the simulator schema is known.
 * Kept deliberately thin so it is a 20 minute job, not a refactor.
 */
class AnimaSimAdapter implements EhrAdapter {
  readonly name = "Anima simulator";
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async call<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Anima sim ${path} -> ${res.status}`);
    return (await res.json()) as T;
  }

  async listEpisodes() {
    // TODO: map simulator response -> { episode_id, patient_name }
    return this.call<{ episode_id: string; patient_name: string }[]>("/episodes");
  }

  async getEpisode(episodeId: string) {
    // TODO: map simulator response -> EhrBundle
    return this.call<EhrBundle>(`/episodes/${episodeId}`);
  }

  async getCohort() {
    return this.call<CohortEpisode[]>("/episodes/latency");
  }
}

let cached: EhrAdapter | null = null;

export function getAdapter(): EhrAdapter {
  if (cached) return cached;
  const key = process.env.ANIMA_SIM_API_KEY;
  const base = process.env.ANIMA_SIM_BASE_URL;
  cached =
    key && base && process.env.CARECLOSURE_USE_SIM === "1"
      ? new AnimaSimAdapter(base, key)
      : new MockAdapter();
  return cached;
}
