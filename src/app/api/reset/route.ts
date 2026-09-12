import { resetState, type EpisodeKey } from "@/lib/store/state";

export async function POST(req: Request) {
  let episode: EpisodeKey | undefined;
  try {
    const body = (await req.json()) as { episode?: EpisodeKey };
    episode = body.episode;
  } catch {
    /* no body: keep the current episode */
  }
  const s = resetState(episode);
  return Response.json({ ok: true, episode: s.episode, meta: s.meta });
}
