'use client'

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { Site } from '@/ctl/contracts'
import styles from './neighbourhood.module.css'
import { bakeGround, bakeSky, bakeStructures } from './bake-layers'
import {
  DEFAULT_ZOOM,
  SITE_PLOTS,
  centreOn,
  clampCamera,
  hitTestPlot,
  screenToWorld,
  stepZoom,
  WORLD_H,
  WORLD_W,
  type Point,
  type Zoom,
} from './layout'
import { phaseFor, type SkyPhase } from './palette'
import { bakeActorSheet, type ActorSheet } from './sprites-actors'
import { createWorld, freezeWorld, stepWorld, syncWorld, type WorldState } from './engine'
import { renderFrame, renderMinimap, type Viewport } from './render'
import type { TownDoc, TownModel } from './model'

export interface TownControls {
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
  focusSite: (site: Site) => void
  focusFromMinimap: (fractionX: number, fractionY: number) => void
}

export interface NeighbourhoodCanvasProps {
  model: TownModel
  /** Overrides the clock-derived phase; only set by the labelled preview control. */
  phaseOverrideMs: number | null
  reduced: boolean
  /** True while a refresh is in flight, which is what the agent sprite shows. */
  agentBusy: boolean
  selected: Site | null
  onSelect: (site: Site | null) => void
  onHover: (site: Site | null) => void
  onZoom: (zoom: Zoom) => void
  /** Mirrors the agent's bubble into the DOM so it is never canvas-only. */
  onAgentSays: (lines: string[], source: TownDoc | null) => void
  controls: RefObject<TownControls | null>
  minimap: RefObject<HTMLCanvasElement | null>
}

const DRAG_THRESHOLD = 5

/** Integer device ratio: a fractional one puts logical pixels between device pixels. */
function integerDpr(): number {
  if (typeof window === 'undefined') return 1
  return Math.max(1, Math.floor(window.devicePixelRatio || 1))
}

export function NeighbourhoodCanvas({
  model,
  phaseOverrideMs,
  reduced,
  agentBusy,
  selected,
  onSelect,
  onHover,
  onZoom,
  onAgentSays,
  controls,
  minimap,
}: NeighbourhoodCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const camRef = useRef<Point>({ x: 0, y: 0 })
  const zoomRef = useRef<Zoom>(DEFAULT_ZOOM)
  const viewRef = useRef<Viewport>({ w: 800, h: 500, dpr: 1 })
  const worldRef = useRef<WorldState | null>(null)
  const sheetRef = useRef<ActorSheet | null>(null)
  const groundRef = useRef<HTMLCanvasElement | null>(null)
  const structuresRef = useRef<ReturnType<typeof bakeStructures> | null>(null)
  const skyRef = useRef<{ canvas: HTMLCanvasElement; key: string } | null>(null)
  const hoveredRef = useRef<Site | null>(null)
  const dragRef = useRef<{ active: boolean; moved: number; x: number; y: number } | null>(null)
  const lastBubbleRef = useRef<string>('')
  const modelRef = useRef(model)
  const agentBusyRef = useRef(agentBusy)
  const selectedRef = useRef(selected)
  const reducedRef = useRef(reduced)

  const [dragging, setDragging] = useState(false)
  const [ready, setReady] = useState(false)
  /** Set when the environment has no 2D context. The table below the map still works. */
  const [canvasError, setCanvasError] = useState<string | null>(null)

  const phase: SkyPhase = useMemo(
    () => phaseFor(phaseOverrideMs ?? model.now),
    [phaseOverrideMs, model.now],
  )
  const phaseRef = useRef(phase)

  modelRef.current = model
  agentBusyRef.current = agentBusy
  selectedRef.current = selected
  reducedRef.current = reduced
  phaseRef.current = phase

  // Static layers. Ground never changes; structures depend on the phase (window
  // lights, shadow direction) and on the catalogue names painted on the signs.
  useEffect(() => {
    try {
      groundRef.current = bakeGround()
      sheetRef.current = bakeActorSheet()
      setReady(true)
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const signatureOfNames = model.sites.map((site) => `${site.site}:${site.name ?? ''}`).join('|')
  useEffect(() => {
    if (!ready) return
    try {
      structuresRef.current = bakeStructures(modelRef.current.sites, phaseRef.current)
    } catch (error) {
      setCanvasError(error instanceof Error ? error.message : String(error))
    }
  }, [phase, signatureOfNames, ready])

  // World population. Rebuilt only when the set of readable sites changes, so a
  // routine refresh does not teleport everyone back to their front door.
  const populationKey = model.sites
    .map((site) => `${site.site}:${site.readFailed ? 0 : 1}:${site.staffing?.doctors ?? 0}`)
    .join('|')
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    worldRef.current = createWorld(modelRef.current, sheet.skins)
    if (reducedRef.current) freezeWorld(worldRef.current)
  }, [populationKey, ready])

  useEffect(() => {
    if (!worldRef.current) return
    syncWorld(worldRef.current, model)
    if (reducedRef.current) freezeWorld(worldRef.current)
  }, [model])

  const resize = useCallback(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return
    const dpr = integerDpr()
    const w = Math.max(320, Math.floor(stage.clientWidth))
    const h = Math.max(240, Math.floor(stage.clientHeight))
    canvas.width = w * dpr
    canvas.height = h * dpr
    viewRef.current = { w, h, dpr }
    camRef.current = clampCamera(camRef.current, zoomRef.current, w, h)

    const map = minimap.current
    if (map) {
      const mw = Math.max(120, Math.floor(map.clientWidth))
      const mh = Math.round((mw * WORLD_H) / WORLD_W)
      map.width = mw * dpr
      map.height = mh * dpr
      map.style.height = `${mh}px`
    }
  }, [minimap])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [resize])

  // Open on the site holding the most breached work, so the first thing the eye
  // lands on is the thing that matters.
  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current || !ready) return
    const worst = [...model.sites]
      .filter((site) => !site.readFailed)
      .sort((a, b) => b.breachedCount - a.breachedCount)[0]
    const target = worst ? SITE_PLOTS[worst.site] : SITE_PLOTS.gp
    const view = viewRef.current
    camRef.current = centreOn(
      { x: target.rect.x + target.rect.w / 2, y: target.rect.y + target.rect.h / 2 },
      zoomRef.current,
      view.w,
      view.h,
    )
    openedRef.current = true
  }, [model.sites, ready])

  const applyZoom = useCallback(
    (next: Zoom, anchor?: { x: number; y: number }) => {
      const view = viewRef.current
      const cam = camRef.current
      const focal = anchor ?? { x: view.w / 2, y: view.h / 2 }
      const world = screenToWorld(focal.x, focal.y, cam, zoomRef.current)
      zoomRef.current = next
      camRef.current = clampCamera(
        { x: world.x - focal.x / next, y: world.y - focal.y / next },
        next,
        view.w,
        view.h,
      )
      onZoom(next)
    },
    [onZoom],
  )

  useImperativeHandle(
    controls,
    (): TownControls => ({
      zoomIn: () => applyZoom(stepZoom(zoomRef.current, 1)),
      zoomOut: () => applyZoom(stepZoom(zoomRef.current, -1)),
      reset: () => {
        const view = viewRef.current
        zoomRef.current = DEFAULT_ZOOM
        camRef.current = centreOn({ x: WORLD_W / 2, y: WORLD_H / 2 }, DEFAULT_ZOOM, view.w, view.h)
        onZoom(DEFAULT_ZOOM)
      },
      focusSite: (site) => {
        const view = viewRef.current
        const plot = SITE_PLOTS[site]
        camRef.current = centreOn(
          { x: plot.rect.x + plot.rect.w / 2, y: plot.rect.y + plot.rect.h / 2 },
          zoomRef.current,
          view.w,
          view.h,
        )
      },
      focusFromMinimap: (fx, fy) => {
        const view = viewRef.current
        camRef.current = centreOn(
          { x: fx * WORLD_W, y: fy * WORLD_H },
          zoomRef.current,
          view.w,
          view.h,
        )
      },
    }),
    [applyZoom, controls, onZoom],
  )

  // Frame loop. Under reduced motion the town is drawn once per model change
  // and then left alone; nothing animates and everything stays readable.
  useEffect(() => {
    if (!ready) return
    let raf = 0
    let last = performance.now()
    let stopped = false

    const draw = (time: number) => {
      if (stopped) return
      const dt = Math.min(100, time - last)
      last = time

      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d') ?? null
      const world = worldRef.current
      const sheet = sheetRef.current
      const ground = groundRef.current
      const structures = structuresRef.current
      if (!ctx || !world || !sheet || !ground || !structures) {
        raf = requestAnimationFrame(draw)
        return
      }

      const view = viewRef.current
      const skyKey = `${phaseRef.current.id}:${view.w}x${view.h}:${view.dpr}`
      if (!skyRef.current || skyRef.current.key !== skyKey) {
        skyRef.current = {
          canvas: bakeSky(phaseRef.current, view.w * view.dpr, view.h * view.dpr),
          key: skyKey,
        }
      }

      stepWorld(world, dt, modelRef.current, {
        agentBusy: agentBusyRef.current,
        frozen: reducedRef.current,
      })

      const bubbleKey = world.agent.bubble.join('|')
      if (bubbleKey !== lastBubbleRef.current) {
        lastBubbleRef.current = bubbleKey
        onAgentSays(world.agent.bubble, world.agent.source)
      }

      renderFrame({
        ctx,
        view,
        cam: camRef.current,
        zoom: zoomRef.current,
        phase: phaseRef.current,
        sky: skyRef.current.canvas,
        ground,
        structures: structures.canvas,
        lamps: structures.lamps,
        litPanes: structures.litPanes,
        sheet,
        world,
        model: modelRef.current,
        hovered: hoveredRef.current,
        selected: selectedRef.current,
        reduced: reducedRef.current,
      })

      const map = minimap.current
      const mapCtx = map?.getContext('2d') ?? null
      if (map && mapCtx) {
        renderMinimap({
          ctx: mapCtx,
          w: map.width / view.dpr,
          h: map.height / view.dpr,
          dpr: view.dpr,
          structures: structures.canvas,
          cam: camRef.current,
          zoom: zoomRef.current,
          view,
          model: modelRef.current,
        })
      }

      if (!reducedRef.current) raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
    }
  }, [ready, reduced, minimap, onAgentSays, model])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { active: true, moved: 0, x: event.clientX, y: event.clientY }
    setDragging(true)
  }, [])

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const drag = dragRef.current
      if (drag?.active) {
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        drag.x = event.clientX
        drag.y = event.clientY
        drag.moved += Math.abs(dx) + Math.abs(dy)
        const view = viewRef.current
        camRef.current = clampCamera(
          { x: camRef.current.x - dx / zoomRef.current, y: camRef.current.y - dy / zoomRef.current },
          zoomRef.current,
          view.w,
          view.h,
        )
        return
      }
      const world = screenToWorld(
        event.clientX - rect.left,
        event.clientY - rect.top,
        camRef.current,
        zoomRef.current,
      )
      const site = hitTestPlot(world)
      if (site !== hoveredRef.current) {
        hoveredRef.current = site
        onHover(site)
      }
    },
    [onHover],
  )

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current
      dragRef.current = null
      setDragging(false)
      if (!drag || drag.moved > DRAG_THRESHOLD) return
      const rect = event.currentTarget.getBoundingClientRect()
      const world = screenToWorld(
        event.clientX - rect.left,
        event.clientY - rect.top,
        camRef.current,
        zoomRef.current,
      )
      onSelect(hitTestPlot(world))
    },
    [onSelect],
  )

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const next = stepZoom(zoomRef.current, event.deltaY < 0 ? 1 : -1)
      if (next === zoomRef.current) return
      applyZoom(next, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    },
    [applyZoom],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      const view = viewRef.current
      const step = 64 / zoomRef.current
      const pan = (dx: number, dy: number) => {
        camRef.current = clampCamera(
          { x: camRef.current.x + dx, y: camRef.current.y + dy },
          zoomRef.current,
          view.w,
          view.h,
        )
      }
      switch (event.key) {
        case 'ArrowLeft':
          pan(-step, 0)
          break
        case 'ArrowRight':
          pan(step, 0)
          break
        case 'ArrowUp':
          pan(0, -step)
          break
        case 'ArrowDown':
          pan(0, step)
          break
        case '+':
        case '=':
          applyZoom(stepZoom(zoomRef.current, 1))
          break
        case '-':
        case '_':
          applyZoom(stepZoom(zoomRef.current, -1))
          break
        default:
          return
      }
      event.preventDefault()
    },
    [applyZoom],
  )

  // Wheel needs a non-passive listener to be able to preventDefault.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const block = (event: WheelEvent) => event.preventDefault()
    canvas.addEventListener('wheel', block, { passive: false })
    return () => canvas.removeEventListener('wheel', block)
  }, [])

  const namedSites = model.sites.map((site) => site.placeName ?? site.site).join(', ')

  return (
    <div className={styles.stage} ref={stageRef}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-dragging={dragging}
        data-testid="neighbourhood-canvas"
        tabIndex={0}
        role="img"
        aria-label={`Pixel map of the simulated neighbourhood showing ${model.sites.length} sites: ${namedSites}. Drag to pan, plus and minus to zoom. The same information is listed in the table below the map.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
      />
      {canvasError ? (
        <p className={styles.banner} data-testid="canvas-unavailable">
          This environment did not provide a 2D canvas ({canvasError}). The neighbourhood is listed as
          data below the map.
        </p>
      ) : null}
    </div>
  )
}
