/**
 * The living state of the town: who is walking where, which documents are in
 * flight, and what the agent is doing.
 *
 * Stepping is deterministic. Choices that would normally use `Math.random` use
 * a counter hash instead, so two runs of the same model produce the same town
 * and a paused clock produces a still frame rather than a drifting one.
 *
 * Nothing in here invents data. An actor is a sprite with a home site; a
 * document is a real event from `/api/clock` following its own `visibleTo`
 * chain across the map.
 */

import type { Site } from '@/ctl/contracts'
import {
  GATES,
  PATIENT_HOMES,
  SITE_ORDER,
  SITE_PLOTS,
  anchorFor,
  facingFrom,
  pointAlong,
  polylineLength,
  routeBetween,
  type Facing,
  type Point,
} from './layout'
import { hashIndex } from './palette'
import type { TownDoc, TownModel, TownSite } from './model'
import type { ActorRole, ActorSkin } from './sprites-actors'

const ACTOR_SPEED = 26
const COURIER_SPEED = 38
const DOC_SPEED = 74
const WALK_FRAME_MS = 150
const DOC_FRAME_MS = 190
const SPAWN_INTERVAL_MS = 1300
const DWELL_MS = 2600
/** How long a document lingers at its destination before it is filed away. */
const ARRIVAL_HOLD_MS = 1400

export interface Actor {
  id: string
  skinId: string
  role: ActorRole
  route: Point[]
  routeLength: number
  /** Distance travelled along the current route. */
  travelled: number
  speed: number
  facing: Facing
  frame: number
  frameMs: number
  dwellMs: number
  /** The site this actor belongs to, for the accessible list and tooltips. */
  homeSite: Site | null
  /** Where it is heading, so a hover can say so honestly. */
  destination: string
}

export interface FlyingDoc {
  doc: TownDoc
  route: Point[]
  routeLength: number
  travelled: number
  frame: number
  frameMs: number
  /** Counts down once the document reaches the end of its chain. */
  holdMs: number
  /** Scope the document is currently heading toward. */
  towards: string
  done: boolean
}

export type AgentState = 'idle' | 'thinking' | 'proposing'

export interface AgentView {
  actor: Actor
  state: AgentState
  /** Lines for the speech bubble. Only ever real fields from a real event. */
  bubble: string[]
  bubbleMs: number
  /** The event the bubble is restating, so the HUD can show the same thing. */
  source: TownDoc | null
}

export interface WorldState {
  actors: Actor[]
  docs: FlyingDoc[]
  agent: AgentView
  /** Position in the model's document list, so the trail cycles rather than stops. */
  cursor: number
  spawnMs: number
  seen: Set<string>
  /** Documents waiting to launch, newest real events first. */
  queue: TownDoc[]
  elapsedMs: number
  tick: number
}

function siteDoor(site: Site): Point {
  const plot = SITE_PLOTS[site]
  return { x: plot.door.x, y: plot.door.y + 8 }
}

function homeDoor(index: number): Point {
  const home = PATIENT_HOMES[index % PATIENT_HOMES.length]!
  return { x: home.x + home.w - 14, y: home.y + home.h + 8 }
}

function makeRoute(from: Point, to: Point): Point[] {
  return routeBetween(from, to)
}

function newActor(
  id: string,
  skinId: string,
  role: ActorRole,
  homeSite: Site | null,
  from: Point,
  to: Point,
  destination: string,
  speed: number,
): Actor {
  const route = makeRoute(from, to)
  return {
    id,
    skinId,
    role,
    route,
    routeLength: polylineLength(route),
    travelled: 0,
    speed,
    facing: 'south',
    frame: 0,
    frameMs: 0,
    dwellMs: 0,
    homeSite,
    destination,
  }
}

/** Sites that actually returned something, so nobody walks to a failed read. */
function liveSites(model: TownModel): Site[] {
  const live = model.sites.filter((site) => !site.readFailed && site.scanned > 0).map((s) => s.site)
  return live.length > 0 ? live : [...SITE_ORDER]
}

function pick<T>(items: readonly T[], seed: string): T {
  return items[hashIndex(seed, items.length)]!
}

/**
 * Populate the town.
 *
 * Per-site head-count comes from the real `staffing` numbers but is capped by
 * `model.spriteCaps` for legibility — four doctors at seven sites would be a
 * crowd, not a picture. The caps are reported in the HUD rather than hidden.
 */
export function createWorld(model: TownModel, skins: ActorSkin[]): WorldState {
  const actors: Actor[] = []
  const sites = liveSites(model)
  const clinicianSkins = skins.filter((s) => s.role === 'clinician')
  const nurseSkins = skins.filter((s) => s.role === 'nurse')
  const residentSkins = skins.filter((s) => s.role === 'resident')
  const courierSkin = skins.find((s) => s.role === 'courier')
  const agentSkin = skins.find((s) => s.role === 'agent')

  for (const site of model.sites) {
    if (site.readFailed) continue
    const doctors = site.staffing?.doctors ?? 0
    const nurses = site.staffing?.nurses ?? 0
    const clinicians = Math.min(doctors, model.spriteCaps.cliniciansPerSite)
    const nurseCount = Math.min(nurses, model.spriteCaps.nursesPerSite)

    for (let i = 0; i < clinicians; i += 1) {
      const target = pick(sites, `${site.site}-c-${i}`)
      actors.push(
        newActor(
          `clinician-${site.site}-${i}`,
          pick(clinicianSkins, `${site.site}${i}`).id,
          'clinician',
          site.site,
          siteDoor(site.site),
          siteDoor(target),
          target,
          ACTOR_SPEED,
        ),
      )
    }
    for (let i = 0; i < nurseCount; i += 1) {
      const target = pick(sites, `${site.site}-n-${i}`)
      actors.push(
        newActor(
          `nurse-${site.site}-${i}`,
          (nurseSkins[0] ?? clinicianSkins[0]!).id,
          'nurse',
          site.site,
          siteDoor(site.site),
          siteDoor(target),
          target,
          ACTOR_SPEED,
        ),
      )
    }
  }

  // Residents walk out of the homes that make up the `patient` scope.
  for (let i = 0; i < Math.min(model.spriteCaps.residents, PATIENT_HOMES.length * 2); i += 1) {
    const target = pick(sites, `resident-${i}`)
    actors.push(
      newActor(
        `resident-${i}`,
        pick(residentSkins.length > 0 ? residentSkins : skins, `r${i}`).id,
        'resident',
        null,
        homeDoor(i),
        siteDoor(target),
        target,
        ACTOR_SPEED,
      ),
    )
  }

  if (courierSkin) {
    for (let i = 0; i < 2; i += 1) {
      const from = pick(sites, `courier-from-${i}`)
      const to = pick(sites, `courier-to-${i}`)
      actors.push(
        newActor(
          `courier-${i}`,
          courierSkin.id,
          'courier',
          null,
          siteDoor(from),
          siteDoor(to),
          to,
          COURIER_SPEED,
        ),
      )
    }
  }

  const busiest = busiestSite(model)
  const agentActor = newActor(
    'agent',
    (agentSkin ?? skins[0]!).id,
    'agent',
    null,
    GATES.control!.point,
    siteDoor(busiest),
    busiest,
    ACTOR_SPEED,
  )

  return {
    actors,
    docs: [],
    agent: { actor: agentActor, state: 'idle', bubble: [], bubbleMs: 0, source: null },
    cursor: 0,
    spawnMs: 0,
    seen: new Set(),
    queue: [...model.docs].filter((doc) => doc.routed.length >= 2),
    elapsedMs: 0,
    tick: 0,
  }
}

/** The site carrying the most breached unclosed work. Time only, no judgement. */
export function busiestSite(model: TownModel): Site {
  let best: TownSite | null = null
  for (const site of model.sites) {
    if (site.readFailed) continue
    if (!best || site.breachedCount > best.breachedCount) best = site
  }
  return best?.site ?? 'gp'
}

/**
 * Fold a refreshed model into a running world.
 *
 * Event ids we have not launched before go to the front of the queue, so a
 * freshly arrived handover crosses the town promptly instead of waiting behind
 * the backlog. That is the whole point of the paper trail.
 */
export function syncWorld(state: WorldState, model: TownModel): void {
  const routable = model.docs.filter((doc) => doc.routed.length >= 2)
  const fresh = routable.filter((doc) => !state.seen.has(doc.eventId))
  const known = new Set(state.queue.map((doc) => doc.eventId))
  const carried = state.queue.filter((doc) => routable.some((d) => d.eventId === doc.eventId))
  state.queue = [...fresh.filter((doc) => !known.has(doc.eventId)), ...carried]
  if (state.queue.length === 0) state.queue = routable
  state.cursor = 0
}

/** Bubble text: only fields the event actually carries. Nothing added. */
export function bubbleLinesFor(doc: TownDoc): string[] {
  const lines: string[] = [doc.type]
  if (doc.actor) lines.push(`from ${doc.actor}`)
  if (doc.detail) lines.push(doc.detail.slice(0, 34))
  if (doc.patientId) lines.push(doc.patientId)
  else if (doc.resourceId) lines.push(doc.resourceId)
  return lines.slice(0, 4)
}

function docRoute(doc: TownDoc): Point[] {
  const anchors = doc.routed
    .map((scope) => anchorFor(scope))
    .filter((point): point is Point => point !== null)
  if (anchors.length < 2) return []
  const route: Point[] = []
  for (let i = 0; i + 1 < anchors.length; i += 1) {
    const leg = routeBetween(anchors[i]!, anchors[i + 1]!)
    route.push(...(i === 0 ? leg : leg.slice(1)))
  }
  return route
}

function launchDoc(state: WorldState, doc: TownDoc): void {
  const route = docRoute(doc)
  if (route.length < 2) return
  state.docs.push({
    doc,
    route,
    routeLength: polylineLength(route),
    travelled: 0,
    frame: 0,
    frameMs: 0,
    holdMs: ARRIVAL_HOLD_MS,
    towards: doc.routed[doc.routed.length - 1]!,
    done: false,
  })
  state.seen.add(doc.eventId)
}

function retargetActor(actor: Actor, state: WorldState, model: TownModel): void {
  const sites = liveSites(model)
  const current = actor.route[actor.route.length - 1] ?? siteDoor(sites[0]!)
  state.tick += 1
  const seed = `${actor.id}:${state.tick}`

  let destination: Point
  let label: string
  if (actor.role === 'resident' && hashIndex(seed, 3) === 0) {
    const index = hashIndex(`${seed}h`, PATIENT_HOMES.length)
    destination = homeDoor(index)
    label = 'patient'
  } else if (actor.role === 'courier') {
    const site = pick(sites, `${seed}c`)
    destination = siteDoor(site)
    label = site
  } else if (actor.homeSite && hashIndex(seed, 2) === 0) {
    destination = siteDoor(actor.homeSite)
    label = actor.homeSite
  } else {
    const site = pick(sites, seed)
    destination = siteDoor(site)
    label = site
  }

  actor.route = makeRoute(current, destination)
  actor.routeLength = polylineLength(actor.route)
  actor.travelled = 0
  actor.destination = label
  actor.dwellMs = DWELL_MS + hashIndex(`${seed}d`, 2400)
}

export interface StepOptions {
  /** True while a refresh is in flight; the agent sprite shows it. */
  agentBusy: boolean
  /** Frozen for prefers-reduced-motion: positions hold, nothing animates. */
  frozen: boolean
}

export function stepWorld(
  state: WorldState,
  dtMs: number,
  model: TownModel,
  options: StepOptions,
): void {
  if (options.frozen) {
    state.agent.state = options.agentBusy ? 'thinking' : state.agent.state
    return
  }

  state.elapsedMs += dtMs
  const dt = dtMs / 1000

  for (const actor of state.actors) {
    if (actor.dwellMs > 0) {
      actor.dwellMs -= dtMs
      actor.frame = 0
      continue
    }
    actor.travelled += actor.speed * dt
    actor.frameMs += dtMs
    if (actor.frameMs >= WALK_FRAME_MS) {
      actor.frameMs -= WALK_FRAME_MS
      actor.frame = (actor.frame + 1) % 4
    }
    if (actor.travelled >= actor.routeLength) {
      retargetActor(actor, state, model)
      continue
    }
    const { dx, dy } = pointAlong(actor.route, actor.travelled / Math.max(1, actor.routeLength))
    actor.facing = facingFrom(dx, dy)
  }

  // The agent walks toward whichever site holds the most breached work.
  const agent = state.agent
  if (agent.actor.travelled >= agent.actor.routeLength) {
    const target = busiestSite(model)
    const from = agent.actor.route[agent.actor.route.length - 1] ?? GATES.control!.point
    agent.actor.route = makeRoute(from, siteDoor(target))
    agent.actor.routeLength = polylineLength(agent.actor.route)
    agent.actor.travelled = 0
    agent.actor.destination = target
  } else {
    agent.actor.travelled += agent.actor.speed * dt
    agent.actor.frameMs += dtMs
    if (agent.actor.frameMs >= WALK_FRAME_MS) {
      agent.actor.frameMs -= WALK_FRAME_MS
      agent.actor.frame = (agent.actor.frame + 1) % 4
    }
    const { dx, dy } = pointAlong(
      agent.actor.route,
      agent.actor.travelled / Math.max(1, agent.actor.routeLength),
    )
    agent.actor.facing = facingFrom(dx, dy)
  }

  if (agent.bubbleMs > 0) {
    agent.bubbleMs -= dtMs
    if (agent.bubbleMs <= 0) {
      agent.bubble = []
      agent.source = null
    }
  }
  agent.state = options.agentBusy ? 'thinking' : agent.bubble.length > 0 ? 'proposing' : 'idle'

  // Launch the next document, then let the ones in flight travel.
  state.spawnMs += dtMs
  if (state.spawnMs >= SPAWN_INTERVAL_MS && state.docs.length < model.spriteCaps.documents) {
    state.spawnMs = 0
    if (state.queue.length > 0) {
      const doc = state.queue[state.cursor % state.queue.length]!
      state.cursor = (state.cursor + 1) % state.queue.length
      launchDoc(state, doc)
      // The agent narrates the document it just saw leave, using its own fields.
      state.agent.bubble = bubbleLinesFor(doc)
      state.agent.bubbleMs = 4200
      state.agent.source = doc
    }
  }

  for (const flying of state.docs) {
    flying.frameMs += dtMs
    if (flying.frameMs >= DOC_FRAME_MS) {
      flying.frameMs -= DOC_FRAME_MS
      flying.frame = (flying.frame + 1) % 3
    }
    if (flying.travelled < flying.routeLength) {
      flying.travelled += DOC_SPEED * dt
    } else {
      flying.holdMs -= dtMs
      if (flying.holdMs <= 0) flying.done = true
    }
  }
  state.docs = state.docs.filter((flying) => !flying.done)
}

/**
 * Compose a readable still for `prefers-reduced-motion`.
 *
 * A frozen town with everyone standing on a doorstep and no documents visible
 * would hide the very thing the view exists to show, so actors are distributed
 * along their routes and a handful of documents are parked mid-journey. Nothing
 * then moves, but the picture still says what is happening.
 */
export function freezeWorld(state: WorldState): void {
  state.actors.forEach((actor, index) => {
    actor.travelled = actor.routeLength * (0.15 + (hashIndex(`${actor.id}${index}`, 60) / 100))
    actor.frame = index % 2 === 0 ? 0 : 2
    actor.dwellMs = 0
    const { dx, dy } = pointAlong(actor.route, actor.travelled / Math.max(1, actor.routeLength))
    actor.facing = facingFrom(dx, dy)
  })

  state.agent.actor.travelled = state.agent.actor.routeLength * 0.5
  const still = Math.min(5, state.queue.length)
  for (let i = 0; i < still; i += 1) {
    const doc = state.queue[i]!
    launchDoc(state, doc)
    const flying = state.docs[state.docs.length - 1]
    if (flying) flying.travelled = flying.routeLength * (0.3 + i * 0.12)
  }
  if (state.queue.length > 0) {
    state.agent.bubble = bubbleLinesFor(state.queue[0]!)
    state.agent.bubbleMs = Number.POSITIVE_INFINITY
    state.agent.source = state.queue[0]!
    state.agent.state = 'proposing'
  }
}

/** Where a document is right now, plus which scope it is between. */
export function docPosition(flying: FlyingDoc): { at: Point; arrived: boolean } {
  const t = flying.routeLength === 0 ? 1 : flying.travelled / flying.routeLength
  const { at } = pointAlong(flying.route, t)
  return { at, arrived: t >= 1 }
}

export function actorPosition(actor: Actor): Point {
  const t = actor.routeLength === 0 ? 1 : Math.min(1, actor.travelled / actor.routeLength)
  return pointAlong(actor.route, t).at
}
