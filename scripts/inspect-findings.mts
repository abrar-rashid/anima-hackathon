import { readFileSync } from 'node:fs'
import { normaliseResource } from '../src/ctl/normalise/resources.ts'
import { runDetectors, summariseFindings } from '../src/ctl/detect/index.ts'
import { computeLatency } from '../src/ctl/latency/index.ts'
import type { Site, SimResource } from '../src/ctl/contracts.ts'

/** Local diagnostic: what do the detectors actually surface from real data? */

const SITES: Site[] = [
  'gp',
  'hospital',
  'community',
  'pharmacy',
  'diagnostics',
  'referrals',
  'wearables',
]

const all: SimResource[] = []
let now = 0
let total = 0

for (const site of SITES) {
  const raw = JSON.parse(readFileSync(`tests/fixtures/live/v-${site}.json`, 'utf8'))
  now = Math.max(now, raw.now ?? 0)
  total += raw.resourceTotal ?? 0
  for (const r of raw.resources ?? []) {
    const n = normaliseResource(r, site)
    if (n) all.push(n)
  }
}

const window = { scanned: all.length, total, sites: SITES, now, failedSites: [] }
const findings = runDetectors(all, now)

console.log(`scanned ${all.length} of ${total} across ${SITES.length} services`)
console.log(`simulator now: ${new Date(now).toISOString()}`)
console.log(`findings: ${findings.length}\n`)

const byDetector = new Map<string, number>()
for (const f of findings) byDetector.set(f.detector, (byDetector.get(f.detector) ?? 0) + 1)
console.log('by detector:')
for (const [d, n] of [...byDetector].sort((a, b) => b[1] - a[1])) console.log(`  ${n} ${d}`)

console.log('\nstalled-loop composition by record kind:')
const stalledKinds = new Map<string, number>()
for (const f of findings.filter((x) => x.detector === 'stalled-loop')) {
  const res = all.find((r) => r.id === f.citations[0]?.resourceId)
  const key = `${res?.kind ?? '?'} / ${res?.status ?? '?'}`
  stalledKinds.set(key, (stalledKinds.get(key) ?? 0) + 1)
}
for (const [k, n] of [...stalledKinds].sort((a, b) => b[1] - a[1])) console.log(`  ${n} × ${k}`)

console.log('\nheadline:')
for (const r of summariseFindings(findings, window)) {
  console.log(`  ${r.label}: ${r.numerator} of ${r.denominator}`)
}

console.log('\ntop 10 as a clinician reads them:')
for (const f of findings.slice(0, 10)) {
  console.log(`  [${f.priority ?? 'no priority'}] ${f.summary}  — ${f.site}`)
}

const latency = computeLatency(all, now, window)
console.log('\nslowest steps:')
for (const b of latency.steps.slice(0, 6)) {
  const h = (b.medianMs / 3_600_000).toFixed(1)
  console.log(`  ${b.label}  n=${b.n}  median ${h}h`)
}

console.log('\nloop breakage:')
for (const r of latency.breakage) console.log(`  ${r.label}: ${r.numerator} of ${r.denominator}`)
