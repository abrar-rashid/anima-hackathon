// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DesignRoot } from '@/design/primitives/design-root'
import { Grid } from '@/design/primitives/grid'
import { Heading } from '@/design/primitives/heading'
import { Stack } from '@/design/primitives/stack'
import { Surface } from '@/design/primitives/surface'
import { Text } from '@/design/primitives/text'

afterEach(() => {
  cleanup()
})

describe('layout and typography primitives', () => {
  it('renders a labelled raised surface inside the design root', () => {
    render(
      <DesignRoot>
        <Surface labelledBy="case-heading">
          <Heading as="h2" id="case-heading">
            hospital
          </Heading>
          <Text tone="muted">Current accountable owner</Text>
        </Surface>
      </DesignRoot>,
    )
    expect(document.querySelector('[data-design-root]')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'hospital' })).toBeTruthy()
    expect(document.querySelector('section')?.getAttribute('aria-labelledby')).toBe('case-heading')
  })

  it('renders stack and grid structures without inventing landmarks', () => {
    render(
      <Stack as="ul" gap="xs">
        <li>one</li>
        <li>two</li>
      </Stack>,
    )
    expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(2)
    render(
      <Grid columns={2}>
        <div>left</div>
        <div>right</div>
      </Grid>,
    )
    expect(screen.getByText('left')).toBeTruthy()
  })
})
