import type { ReactElement } from 'react'
import { assembleWardline } from '@/components/wardline/assemble'
import { WardlineHome } from './WardlineHome'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function Page(): Promise<ReactElement> {
  const initial = await assembleWardline()
  return <WardlineHome initial={initial} />
}
