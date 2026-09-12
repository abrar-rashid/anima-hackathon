import type { ReactNode } from 'react'

/**
 * The town runs edge to edge: the map is the content, so this segment drops the
 * page padding the other surfaces use.
 */
export default function TownLayout({ children }: { children: ReactNode }) {
  return <div style={{ margin: 0, padding: 0 }}>{children}</div>
}
