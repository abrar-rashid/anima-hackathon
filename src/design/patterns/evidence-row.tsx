import { DataList } from '../primitives/data-list'
import { Text } from '../primitives/text'
import styles from './evidence-row.module.css'

export type EvidenceRowProps = {
  id: string
  version: number
  actor: string
  time: string
}

export function EvidenceRow({ id, version, actor, time }: EvidenceRowProps) {
  return (
    <div className={styles.row}>
      <DataList
        compact
        items={[
          { term: 'Id', description: <Text as="span" data>{id}</Text> },
          { term: 'Version', description: <Text as="span" data>{`v${version}`}</Text> },
          { term: 'Actor', description: actor },
          {
            term: 'Time',
            description: <time dateTime={time}>{time}</time>,
          },
        ]}
      />
    </div>
  )
}
