import { NextResponse } from 'next/server'
import { loadTownModel } from '@/components/neighbourhood/load-town'
import { emptyModel } from '@/components/neighbourhood/model'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Refresh the town.
 *
 * Always answers 200 with a model that says how fresh it is, because the canvas
 * polls this and a thrown error would leave a populated town staring at a blank
 * replacement. `loadTownModel` already degrades per read; this only has to
 * catch the case where it fails outright.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const model = await loadTownModel()
    return NextResponse.json({ model }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { model: emptyModel(Date.now(), `town assembly failed: ${message}`) },
      { headers: { 'cache-control': 'no-store' } },
    )
  }
}
