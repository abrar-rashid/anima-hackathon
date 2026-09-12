import { describe, expect, it } from 'vitest'
import {
  BUILDINGS,
  WORLD_H,
  WORLD_W,
  buildingBodies,
  clampCamera,
  composeCharacterSpeech,
  hitTestBuilding,
  layoutSpeechBubbles,
  rectsOverlap,
  runnerPathFor,
  screenToWorld,
  stepAlongPath,
  worldToScreen,
  wrapText,
  zoomAround,
  type TownSimulationData,
} from '@/components/town/town-engine'

function sampleData(overrides: Partial<TownSimulationData['caseStatus']> = {}): TownSimulationData {
  return {
    clock: { now: 1_789_286_400_000, paused: false, speed: 1 },
    patient: {
      id: 'SIM-000001',
      name: 'Amira Khan',
      recentLab: { name: 'CRP', value: 5.6, unit: 'mg/L', isAbnormal: true, refLow: 0, refHigh: 5 },
    },
    caseStatus: {
      ownershipState: 'ORDERER_OWNS',
      closureState: 'RESULT_AVAILABLE',
      currentOwner: 'hospital',
      deadlineMinutes: 30,
      ...overrides,
    },
    recentEvents: [],
  }
}

describe('pixel town world', () => {
  it('is at least 2200 by 1500 with eight non-overlapping districts', () => {
    expect(WORLD_W).toBeGreaterThanOrEqual(2200)
    expect(WORLD_H).toBeGreaterThanOrEqual(1500)
    expect(BUILDINGS).toHaveLength(8)
    const ids = BUILDINGS.map((b) => b.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'hospital',
        'diagnostics',
        'gp',
        'patient',
        'pharmacy',
        'referrals',
        'community',
        'wearables',
      ]),
    )
    const names = BUILDINGS.map((b) => b.name).join(' ')
    expect(names).toMatch(/St\. Jude/)
    expect(names).toMatch(/Pathology/)
    expect(names).toMatch(/High Street GP/)
    expect(names).toMatch(/Amira Khan/)
    expect(names).toMatch(/Pharmacy/)
    expect(names).toMatch(/Referrals/)
    expect(names).toMatch(/Rehabilitation/)
    expect(names).toMatch(/Telemetry/)

    const bodies = buildingBodies()
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        expect(rectsOverlap(bodies[i]!, bodies[j]!, 24)).toBe(false)
      }
    }
  })

  it('converts camera coordinates and clamps the viewport to the world', () => {
    const zoom = 1
    const cam = clampCamera(-40, -20, zoom, 800, 600)
    expect(cam.x).toBe(0)
    expect(cam.y).toBe(0)
    const far = clampCamera(9000, 9000, zoom, 800, 600)
    expect(far.x).toBe(WORLD_W - 800)
    expect(far.y).toBe(WORLD_H - 600)
    const world = screenToWorld(100, 50, 200, 80, 2)
    expect(world).toEqual({ x: 250, y: 105 })
    expect(worldToScreen(250, 105, 200, 80, 2)).toEqual({ x: 100, y: 50 })
  })

  it('zooms around the cursor without leaving the world', () => {
    const next = zoomAround(400, 300, 100, 80, 1, 2, 800, 600)
    expect(next.zoom).toBe(2)
    expect(next.cam.x).toBeGreaterThanOrEqual(0)
    expect(next.cam.y).toBeGreaterThanOrEqual(0)
  })

  it('places speech bubbles that do not overlap buildings or each other', () => {
    const obstacles = buildingBodies()
    const hospital = BUILDINGS.find((b) => b.id === 'hospital')!
    const gp = BUILDINGS.find((b) => b.id === 'gp')!
    const placed = layoutSpeechBubbles(
      [
        {
          id: 'a',
          anchorX: hospital.x + 40,
          anchorY: hospital.y + 20,
          author: 'Dr.',
          text: 'CRP 5.6 mg/L is outside the source range. Transfer to GP needed.',
        },
        {
          id: 'b',
          anchorX: hospital.x + 60,
          anchorY: hospital.y + 24,
          author: 'Lab',
          text: 'CRP 5.6 mg/L released to the ordering team.',
        },
        {
          id: 'c',
          anchorX: gp.x + 40,
          anchorY: gp.y + 20,
          author: 'Ada',
          text: 'On call. No accepted handover on this result yet.',
        },
      ],
      obstacles,
    )
    expect(placed).toHaveLength(3)
    for (const bubble of placed) {
      for (const obstacle of obstacles) {
        expect(rectsOverlap(bubble, obstacle, 6)).toBe(false)
      }
    }
    expect(rectsOverlap(placed[0]!, placed[1]!, 6)).toBe(false)
    expect(hitTestBuilding(hospital.x + 10, hospital.y + 10)?.id).toBe('hospital')
  })

  it('composes live speech from source lab values and ownership', () => {
    const open = composeCharacterSpeech(sampleData())
    expect(open['doctor-morgan']).toMatch(/5\.6/)
    expect(open['doctor-morgan']).toMatch(/mg\/L/)
    expect(open['doctor-morgan']).not.toMatch(/diagnos|treatment|cured/i)
    expect(open['duty-gp']).toMatch(/On call/)

    const accepted = composeCharacterSpeech(sampleData({ ownershipState: 'ACCEPTED', currentOwner: 'gp' }))
    expect(accepted['duty-gp']).toMatch(/Handover accepted/)
    expect(accepted['doctor-morgan']).toMatch(/Duty GP/)
  })

  it('walks the courier along a path and wraps text', () => {
    const path = runnerPathFor('ORDERER_OWNS')
    expect(path.length).toBeGreaterThan(3)
    const step = stepAlongPath({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)
    expect(step.next.x).toBe(4)
    expect(step.arrived).toBe(false)
    expect(wrapText('Transfer to GP needed right now', 12)).toEqual([
      'Transfer to',
      'GP needed',
      'right now',
    ])
  })
})
