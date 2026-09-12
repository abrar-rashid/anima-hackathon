// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DataList } from '@/design/primitives/data-list'
import { Table } from '@/design/primitives/table'

afterEach(() => {
  cleanup()
})

describe('DataList', () => {
  it('renders labelled facts as a definition list', () => {
    render(
      <DataList
        items={[
          { term: 'Id', description: 'blood-v1-SIM-000001-crp-5' },
          { term: 'Actor', description: 'hospital' },
        ]}
      />,
    )
    const list = document.querySelector('dl')
    expect(list).toBeTruthy()
    expect(screen.getByText('Id').tagName).toBe('DT')
    expect(screen.getByText('blood-v1-SIM-000001-crp-5').tagName).toBe('DD')
  })
})

describe('Table', () => {
  it('exposes a caption and column headers', () => {
    render(
      <Table
        caption="Source versions"
        columns={[
          { key: 'id', header: 'Id', render: (row) => row.id, data: true },
          { key: 'version', header: 'Version', render: (row) => `v${row.version}` },
        ]}
        rows={[{ id: 'blood-v1-SIM-000001-crp-5', version: 1 }]}
        getRowKey={(row) => row.id}
      />,
    )
    expect(screen.getByRole('table', { name: 'Source versions' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Id' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: 'Version' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'blood-v1-SIM-000001-crp-5' })).toBeTruthy()
  })
})
