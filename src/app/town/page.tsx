import { loadTownModel } from '@/components/neighbourhood/load-town'
import { NeighbourhoodView } from '@/components/neighbourhood/NeighbourhoodView'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'The neighbourhood · Close The Loop',
  description:
    'A pixel neighbourhood rendered from live Anima simulator reads: seven real sites, their unclosed work, and the events travelling between them. Synthetic data.',
}

/**
 * First paint is server-rendered from the same read path the refresh endpoint
 * uses, so the town arrives populated before any client JavaScript runs.
 */
export default async function TownPage() {
  const model = await loadTownModel()
  return <NeighbourhoodView initial={model} />
}
