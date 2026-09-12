import type { ReactNode } from 'react'
import '../tokens.css'
import styles from './design-root.module.css'

const DIRECTION_CONTRACT = `
THESIS: A clinician sees who owns the handover and the one action that is available before anything else; equal-weight panel soup is refused.
OWN-WORLD: Cool enamel field, iron ink, mandatory cobalt, modest instrument radii, Atkinson Hyperlegible with Red Hat Mono for evidence ids, shape-coded states that never rely on colour alone.
STORY: The visitor understands the current owner, whether a write is available, and that a successful HTTP call is not proof.
FIRST VIEWPORT: Hero fact at display size, state badge inline with the meaning line, decision block immediately under; evidence rows and tables recede.
FORM: Duty Signage, Worboys / ISO 3864 wayfinding, brief-pinned Operate direction. Seed unattended: PRODUCT.md is out of this worker's scope.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
`

export type DesignRootProps = {
  children: ReactNode
}

export function DesignRoot({ children }: DesignRootProps) {
  return (
    <div data-design-root="" className={styles.root}>
      <div hidden data-design-contract="" dangerouslySetInnerHTML={{ __html: `<!--${DIRECTION_CONTRACT}-->` }} />
      {children}
    </div>
  )
}
