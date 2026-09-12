import { WorldView } from '@/components/world'
import { assembleWorld } from './assemble'

export const dynamic = 'force-dynamic'

export default async function WorldPage() {
  const assembly = await assembleWorld()
  return (
    <WorldView
      snapshot={assembly.snapshot}
      replay={assembly.replay}
      comparison={assembly.comparison}
      errorMessage={assembly.error}
    />
  )
}
