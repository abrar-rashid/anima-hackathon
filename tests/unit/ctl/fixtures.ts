import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SITES, type ScanWindow, type SimResource, type Site } from '@/ctl/contracts'
import { normaliseResource } from '@/ctl/normalise/resources'

const FIXTURE_DIR = join(import.meta.dirname, '../../fixtures/live')

interface RawView {
  now?: number
  resourceTotal?: number
  resources?: unknown[]
}

function loadView(filename: string, site: Site): { now: number; total: number; resources: SimResource[] } {
  const raw = JSON.parse(readFileSync(join(FIXTURE_DIR, filename), 'utf8')) as RawView
  return {
    now: raw.now ?? fixtureNow(),
    total: raw.resourceTotal ?? 0,
    resources: (raw.resources ?? [])
      .map((resource) => normaliseResource(resource, site))
      .filter((resource): resource is SimResource => resource !== null),
  }
}

export function fixtureNow(): number {
  const clock = JSON.parse(readFileSync(join(FIXTURE_DIR, 'clock.json'), 'utf8')) as { now: number }
  return clock.now
}

export function gpResources(): SimResource[] {
  return loadView('v-gp.json', 'gp').resources
}

export function hospitalResources(): SimResource[] {
  return loadView('v-hospital.json', 'hospital').resources
}

export function diagnosticsResources(): SimResource[] {
  return loadView('v-diagnostics.json', 'diagnostics').resources
}

export function referralsResources(): SimResource[] {
  return loadView('v-referrals.json', 'referrals').resources
}

export function pharmacyResources(): SimResource[] {
  return loadView('v-pharmacy.json', 'pharmacy').resources
}

export function communityResources(): SimResource[] {
  return loadView('v-community.json', 'community').resources
}

export function wearablesResources(): SimResource[] {
  return loadView('v-wearables.json', 'wearables').resources
}

export function allResources(): SimResource[] {
  return [
    ...gpResources(),
    ...hospitalResources(),
    ...diagnosticsResources(),
    ...referralsResources(),
    ...pharmacyResources(),
    ...communityResources(),
    ...wearablesResources(),
  ]
}

export function fixtureScanWindow(): ScanWindow {
  const totals = SITES.map((site) => loadView(`v-${site}.json`, site))
  return {
    scanned: totals.reduce((sum, slice) => sum + slice.resources.length, 0),
    total: totals.reduce((sum, slice) => sum + slice.total, 0),
    sites: [...SITES],
    now: fixtureNow(),
    failedSites: [],
  }
}

export function findResource(id: string, resources: SimResource[] = allResources()): SimResource | undefined {
  return resources.find((resource) => resource.id === id)
}
