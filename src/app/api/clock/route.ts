import { advanceClock } from "@/lib/store/actions";

export async function POST(req: Request) {
  const { hours } = (await req.json()) as { hours?: number };
  return Response.json(advanceClock(typeof hours === "number" ? hours : 24));
}
