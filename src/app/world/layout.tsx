import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import styles from '@/components/world/world.module.css'

export const metadata: Metadata = {
  title: 'Pixel Societies · Care Covenant',
  description:
    'The same covenant drawn as a night-watch city. Visualises WorldSnapshot fields only. Never writes.',
}

export default function WorldLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {/*
        THESIS: Care is one city; a result is a phial; a covenant is a stitch. Refuses dashboards and invented bustle.
        OWN-WORLD: Night-watch indigo wool, lantern paper, phosphor thread, 8px civic pixel atlas.
        STORY: Watch ownership and neglect at a glance. Never a clinical rank.
        FIRST VIEWPORT: Provenance strip, atlas well, time instrument.
        FORM: Phosphor Borough Atlas.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
      */}
      {children}
    </div>
  )
}
