import { WorldEmpty } from '@/components/world/WorldEmpty'
import { WorldLegend } from '@/components/world/WorldLegend'
import styles from '@/components/world/world.module.css'

export default function WorldLoading() {
  return (
    <div className={styles.page}>
      <header className={styles.mast}>
        <h1>Pixel Societies</h1>
        <p>Assembling the borough atlas from a real snapshot. No city is sketched in while we wait.</p>
      </header>
      <WorldEmpty reason="loading" />
      <WorldLegend snapshot={null} />
    </div>
  )
}
