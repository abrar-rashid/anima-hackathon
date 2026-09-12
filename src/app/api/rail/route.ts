import { buildRail } from "@/lib/engine/rail";
import { getState } from "@/lib/store/state";

export async function GET() {
  const s = getState();
  const rail = buildRail(s.bundle, s.obligations, s.now);
  return Response.json({
    episode: s.episode,
    meta: s.meta,
    rail,
    obligations: s.obligations,
    actors: s.bundle.actors,
    ledger: s.ledger,
    inbox: s.inbox,
    call: s.call,
    bundle: {
      documents: s.bundle.documents,
      observations: s.bundle.observations,
      orders: s.bundle.orders,
      medications: s.bundle.medications,
      referrals: s.bundle.referrals,
      discharge_at: s.bundle.discharge_at,
    },
  });
}
