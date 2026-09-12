'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/components/world/use-reduced-motion'
import styles from './pixel-town.module.css'
import {
  BUILDINGS,
  DECORATIONS,
  DOORS,
  ROADS,
  WORLD_H,
  WORLD_W,
  type BuildingDef,
  type PlacedBubble,
  type Point,
  type TownSimulationData,
  cameraForBuilding,
  clampCamera,
  clampZoom,
  composeCharacterSpeech,
  defaultCamera,
  hitTestBubble,
  hitTestBuilding,
  layoutSpeechBubbles,
  runnerPathFor,
  screenToWorld,
  stepAlongPath,
  worldToScreen,
  zoomAround,
} from './town-engine'

export type { TownSimulationData } from './town-engine'

interface Character {
  id: string
  name: string
  role: string
  homeId: string
  x: number
  y: number
  targetX: number
  targetY: number
  path: Point[]
  loop: boolean
  spriteColor: string
  hairColor: string
  facing: 1 | -1
  moving: boolean
}

interface ViewBox {
  w: number
  h: number
  dpr: number
}

const DRAG_THRESHOLD = 6
const MINIMAP_W = 220
const MINIMAP_H = 146

function seedCharacters(): Character[] {
  return [
    {
      id: 'doctor-morgan',
      name: 'Dr. Morgan Bell',
      role: 'Hospital Acute Lead',
      homeId: 'hospital',
      x: 318,
      y: 348,
      targetX: 318,
      targetY: 348,
      path: [],
      loop: false,
      spriteColor: '#2563eb',
      hairColor: '#334155',
      facing: 1,
      moving: false,
    },
    {
      id: 'lab-tech',
      name: 'Lab Specialist',
      role: 'Diagnostics Technician',
      homeId: 'diagnostics',
      x: 1000,
      y: 340,
      targetX: 1000,
      targetY: 340,
      path: [],
      loop: false,
      spriteColor: '#0284c7',
      hairColor: '#b45309',
      facing: -1,
      moving: false,
    },
    {
      id: 'duty-gp',
      name: 'Dr. Ada Sim',
      role: 'Duty GP',
      homeId: 'gp',
      x: 1990,
      y: 350,
      targetX: 1990,
      targetY: 350,
      path: [],
      loop: false,
      spriteColor: '#16a34a',
      hairColor: '#6b21a8',
      facing: -1,
      moving: false,
    },
    {
      id: 'patient-amira',
      name: 'Amira Khan',
      role: 'Patient at home',
      homeId: 'patient',
      x: 230,
      y: 1360,
      targetX: 230,
      targetY: 1360,
      path: [],
      loop: false,
      spriteColor: '#db2777',
      hairColor: '#1e293b',
      facing: 1,
      moving: false,
    },
    {
      id: 'pharmacist',
      name: 'Pharmacist',
      role: 'Community Pharmacy',
      homeId: 'pharmacy',
      x: 268,
      y: 820,
      targetX: 268,
      targetY: 820,
      path: [],
      loop: false,
      spriteColor: '#ca8a04',
      hairColor: '#44403c',
      facing: 1,
      moving: false,
    },
    {
      id: 'runner-adk',
      name: 'Loop Runner',
      role: 'Covenant Courier',
      homeId: 'hospital',
      x: 340,
      y: 388,
      targetX: 340,
      targetY: 388,
      path: runnerPathFor('ORDERER_OWNS'),
      loop: true,
      spriteColor: '#f59e0b',
      hairColor: '#0f172a',
      facing: 1,
      moving: true,
    },
  ]
}

function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function drawGrass(ctx: CanvasRenderingContext2D, cam: Point, zoom: number, view: ViewBox) {
  const pad = 48
  const x0 = Math.max(0, Math.floor((cam.x - pad) / 32) * 32)
  const y0 = Math.max(0, Math.floor((cam.y - pad) / 32) * 32)
  const x1 = Math.min(WORLD_W, cam.x + view.w / zoom + pad)
  const y1 = Math.min(WORLD_H, cam.y + view.h / zoom + pad)

  px(ctx, '#65d48a', 0, 0, WORLD_W, WORLD_H)
  for (let y = y0; y < y1; y += 32) {
    for (let x = x0; x < x1; x += 32) {
      const checker = ((x + y) / 32) % 2 === 0
      px(ctx, checker ? '#5fce82' : '#6adb90', x, y, 32, 32)
      if ((x + y) % 64 === 0) {
        px(ctx, '#4ade80', x + 6, y + 8, 5, 3)
        px(ctx, '#22c55e', x + 20, y + 20, 4, 3)
      }
    }
  }
}

function drawRoads(ctx: CanvasRenderingContext2D) {
  for (const road of ROADS) {
    px(ctx, '#6b5344', road.x - 6, road.y - 6, road.w + 12, road.h + 12)
    px(ctx, '#d7c4a3', road.x, road.y, road.w, road.h)
    const horizontal = road.w > road.h
    ctx.fillStyle = '#b89b78'
    if (horizontal) {
      for (let x = road.x; x < road.x + road.w; x += 16) {
        ctx.fillRect(x, road.y, 14, 4)
        ctx.fillRect(x + 6, road.y + road.h - 4, 14, 4)
        for (let y = road.y + 12; y < road.y + road.h - 10; y += 14) {
          ctx.fillRect(x + ((y / 14) % 2 === 0 ? 0 : 7), y, 10, 3)
        }
      }
    } else {
      for (let y = road.y; y < road.y + road.h; y += 16) {
        ctx.fillRect(road.x, y, 4, 14)
        ctx.fillRect(road.x + road.w - 4, y + 6, 4, 14)
      }
    }
  }
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, pine: boolean) {
  px(ctx, 'rgba(0,0,0,0.16)', x + 4, y + 34, 16, 6)
  px(ctx, '#7a4a1e', x + 10, y + 24, 6, 16)
  if (pine) {
    px(ctx, '#14532d', x + 2, y + 16, 22, 12)
    px(ctx, '#166534', x + 6, y + 8, 14, 12)
    px(ctx, '#15803d', x + 9, y + 2, 8, 10)
  } else {
    px(ctx, '#166534', x + 1, y + 8, 24, 20)
    px(ctx, '#22c55e', x + 5, y + 4, 16, 14)
    px(ctx, '#4ade80', x + 8, y + 7, 8, 6)
  }
}

function drawDecor(ctx: CanvasRenderingContext2D, frame: number, reduced: boolean) {
  px(ctx, '#4f9d68', 1080, 600, 280, 180)
  px(ctx, '#86efac', 1100, 620, 240, 140)
  px(ctx, '#1d4e89', 1160, 650, 90, 54)
  px(ctx, '#38bdf8', 1172, 660, 66, 20)
  px(ctx, '#7c3f12', 1120, 700, 22, 8)
  px(ctx, '#7c3f12', 1300, 700, 22, 8)

  for (const item of DECORATIONS) {
    if (item.kind === 'tree') drawTree(ctx, item.x, item.y, false)
    else if (item.kind === 'pine') drawTree(ctx, item.x, item.y, true)
    else if (item.kind === 'bush') {
      px(ctx, '#166534', item.x, item.y + 8, 18, 10)
      px(ctx, '#22c55e', item.x + 3, item.y + 4, 12, 8)
    } else if (item.kind === 'lamp') {
      px(ctx, '#1e293b', item.x + 5, item.y, 4, 22)
      px(ctx, '#fde68a', item.x + 2, item.y - 6, 10, 8)
    } else {
      const sway = reduced ? 0 : Math.sin(frame * 0.05 + item.x) * 0.4
      px(ctx, '#166534', item.x + 4, item.y + 8, 3, 6)
      px(ctx, '#fb7185', item.x + 2 + sway, item.y + 2, 6, 6)
    }
  }
}

function drawWindows(
  ctx: CanvasRenderingContext2D,
  b: BuildingDef,
  rowY: number,
  lit: string,
  cols?: number,
) {
  const count = cols ?? Math.floor((b.width - 40) / 40)
  const start = b.x + 22
  for (let i = 0; i < count; i += 1) {
    const wx = start + i * 40
    if (wx + 26 > b.x + b.width - 14) break
    px(ctx, '#1e293b', wx - 2, rowY - 2, 28, 30)
    px(ctx, lit, wx, rowY, 24, 26)
    px(ctx, '#1e3a8a', wx + 11, rowY, 2, 26)
    px(ctx, '#1e3a8a', wx, rowY + 12, 24, 2)
  }
}

function drawRoof(ctx: CanvasRenderingContext2D, b: BuildingDef, flat: boolean) {
  if (flat) {
    px(ctx, '#0f172a', b.x - 10, b.y - 28, b.width + 20, 32)
    px(ctx, b.roofColor, b.x - 8, b.y - 26, b.width + 16, 26)
    px(ctx, b.accentColor, b.x + 16, b.y - 16, b.width - 32, 8)
    return
  }
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.moveTo(b.x - 16, b.y + 2)
  ctx.lineTo(b.x + b.width / 2, b.y - 58)
  ctx.lineTo(b.x + b.width + 16, b.y + 2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = b.roofColor
  ctx.beginPath()
  ctx.moveTo(b.x - 12, b.y)
  ctx.lineTo(b.x + b.width / 2, b.y - 52)
  ctx.lineTo(b.x + b.width + 12, b.y)
  ctx.closePath()
  ctx.fill()
  px(ctx, b.accentColor, b.x + b.width / 2 - 22, b.y - 36, 44, 8)
}

function drawSign(ctx: CanvasRenderingContext2D, b: BuildingDef) {
  px(ctx, '#0f172a', b.x + 18, b.y + 10, b.width - 36, 28)
  px(ctx, b.accentColor, b.x + 18, b.y + 10, b.width - 36, 4)
  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 13px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${b.icon} ${b.sign}`, b.x + b.width / 2, b.y + 26)
}

function drawDoor(ctx: CanvasRenderingContext2D, b: BuildingDef, led: string) {
  const dx = b.x + b.width / 2 - 14
  const dy = b.y + b.height - 40
  px(ctx, '#7c4a1e', dx, dy, 28, 40)
  px(ctx, '#fde68a', dx + 20, dy + 18, 3, 3)
  ctx.fillStyle = led
  ctx.beginPath()
  ctx.arc(b.x + b.width / 2, dy - 8, 5, 0, Math.PI * 2)
  ctx.fill()
}

function drawShell(ctx: CanvasRenderingContext2D, b: BuildingDef, selected: boolean) {
  px(ctx, 'rgba(0,0,0,0.18)', b.x + 8, b.y + 8, b.width, b.height)
  px(ctx, b.color, b.x, b.y, b.width, b.height)
  px(ctx, b.roofColor, b.x, b.y, b.width, 14)
  for (let band = 0; band < b.height; band += 8) {
    px(ctx, 'rgba(15,23,42,0.05)', b.x, b.y + band, b.width, 1)
  }
  ctx.lineWidth = selected ? 4 : 3
  ctx.strokeStyle = selected ? '#f59e0b' : '#1e293b'
  ctx.strokeRect(b.x, b.y, b.width, b.height)
}

function drawAmbulance(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
  px(ctx, 'rgba(0,0,0,0.18)', x + 4, y + 28, 70, 8)
  px(ctx, '#f8fafc', x, y, 72, 28)
  px(ctx, '#dc2626', x, y + 10, 72, 8)
  px(ctx, '#0f172a', x + 48, y + 4, 22, 16)
  px(ctx, '#7dd3fc', x + 52, y + 7, 14, 10)
  px(ctx, frame % 40 < 20 ? '#ef4444' : '#3b82f6', x + 6, y - 4, 8, 6)
  px(ctx, frame % 40 < 20 ? '#3b82f6' : '#ef4444', x + 16, y - 4, 8, 6)
  px(ctx, '#111827', x + 8, y + 24, 12, 12)
  px(ctx, '#111827', x + 48, y + 24, 12, 12)
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  b: BuildingDef,
  selected: boolean,
  frame: number,
  led: string,
) {
  drawShell(ctx, b, selected)

  if (b.id === 'wearables' || b.id === 'referrals' || b.id === 'diagnostics') {
    drawRoof(ctx, b, true)
  } else {
    drawRoof(ctx, b, false)
  }

  if (b.id === 'hospital') {
    px(ctx, '#fecaca', b.x + 36, b.y + 40, 70, 16)
    ctx.fillStyle = '#7f1d1d'
    ctx.font = 'bold 10px ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('EMERGENCY', b.x + 71, b.y + 51)
    drawWindows(ctx, b, b.y + 64, '#93c5fd', 7)
    drawWindows(ctx, b, b.y + 100, '#bfdbfe', 7)
    px(ctx, '#fff1f2', b.x - 18, b.y + b.height - 70, 46, 36)
    px(ctx, '#dc2626', b.x - 18, b.y + b.height - 70, 46, 6)
    px(ctx, '#f8fafc', b.x + b.width / 2 - 10, b.y - 22, 20, 6)
    px(ctx, '#dc2626', b.x + b.width / 2 - 3, b.y - 28, 6, 18)
    drawAmbulance(ctx, b.x - 70, b.y + b.height - 20, frame)
  } else if (b.id === 'diagnostics') {
    drawWindows(ctx, b, b.y + 44, '#7dd3fc', 6)
    drawWindows(ctx, b, b.y + 84, '#bae6fd', 6)
    px(ctx, '#0ea5e9', b.x + 24, b.y + 128, 16, 16)
    px(ctx, '#0369a1', b.x + 48, b.y + 132, 20, 12)
    px(ctx, '#38bdf8', b.x + 76, b.y + 126, 14, 18)
    ctx.strokeStyle = '#075985'
    ctx.beginPath()
    ctx.arc(b.x + 200, b.y + 140, 10, 0, Math.PI * 2)
    ctx.stroke()
    px(ctx, '#64748b', b.x + 40, b.y - 28, 10, 14)
    px(ctx, '#64748b', b.x + 58, b.y - 32, 10, 18)
  } else if (b.id === 'gp') {
    drawWindows(ctx, b, b.y + 48, '#86efac', 6)
    px(ctx, '#bbf7d0', b.x + 24, b.y + 88, 110, 46)
    ctx.strokeStyle = '#166534'
    ctx.strokeRect(b.x + 24, b.y + 88, 110, 46)
    px(ctx, '#a3e635', b.x + 36, b.y + 114, 10, 12)
    px(ctx, '#a3e635', b.x + 56, b.y + 114, 10, 12)
    px(ctx, '#a3e635', b.x + 76, b.y + 114, 10, 12)
    px(ctx, '#78350f', b.x + 18, b.y + 40, b.width - 36, 8)
    px(ctx, '#166534', b.x + 18, b.y + 36, b.width - 36, 4)
  } else if (b.id === 'pharmacy') {
    drawWindows(ctx, b, b.y + 48, '#fde68a', 5)
    px(ctx, '#16a34a', b.x + b.width - 48, b.y + 44, 22, 22)
    px(ctx, '#f8fafc', b.x + b.width - 40, b.y + 48, 6, 14)
    px(ctx, '#f8fafc', b.x + b.width - 44, b.y + 52, 14, 6)
    px(ctx, '#dc2626', b.x + 28, b.y + 86, 6, 10)
    px(ctx, '#2563eb', b.x + 40, b.y + 86, 6, 10)
    px(ctx, '#ca8a04', b.x + 52, b.y + 86, 6, 10)
    px(ctx, '#f59e0b', b.x + 16, b.y + 36, b.width - 32, 8)
  } else if (b.id === 'patient') {
    drawWindows(ctx, b, b.y + 52, '#f5d0fe', 5)
    px(ctx, '#7c2d12', b.x + b.width - 48, b.y - 48, 14, 28)
    px(ctx, '#94a3b8', b.x + 36, b.y - 44, 18, 8)
    ctx.strokeStyle = '#64748b'
    ctx.beginPath()
    ctx.arc(b.x + 45, b.y - 48, 10, Math.PI, 0)
    ctx.stroke()
    px(ctx, '#a3e635', b.x - 18, b.y + b.height - 50, 70, 28)
    px(ctx, '#fb7185', b.x - 8, b.y + b.height - 46, 6, 6)
    px(ctx, '#facc15', b.x + 10, b.y + b.height - 42, 6, 6)
    px(ctx, '#78350f', b.x - 20, b.y + b.height - 24, 90, 4)
  } else if (b.id === 'community') {
    px(ctx, '#365314', b.x + 18, b.y + 40, 16, b.height - 50)
    px(ctx, '#365314', b.x + b.width / 2 - 8, b.y + 40, 16, b.height - 50)
    px(ctx, '#365314', b.x + b.width - 34, b.y + 40, 16, b.height - 50)
    drawWindows(ctx, b, b.y + 56, '#d9f99d', 6)
    px(ctx, '#38bdf8', b.x + b.width / 2 - 16, b.y + 120, 32, 18)
    px(ctx, '#0ea5e9', b.x + b.width / 2 - 4, b.y + 110, 8, 12)
    px(ctx, '#4d7c0f', b.x - 8, b.y + b.height - 36, b.width + 16, 12)
  } else if (b.id === 'referrals') {
    px(ctx, b.roofColor, b.x + 18, b.y - 46, b.width - 36, 28)
    drawWindows(ctx, b, b.y + 40, '#cbd5e1', 6)
    drawWindows(ctx, b, b.y + 78, '#e2e8f0', 6)
    drawWindows(ctx, b, b.y + 116, '#cbd5e1', 6)
    px(ctx, '#1e293b', b.x + 20, b.y + b.height - 58, 18, 40)
    px(ctx, '#1e293b', b.x + b.width - 38, b.y + b.height - 58, 18, 40)
  } else if (b.id === 'wearables') {
    drawWindows(ctx, b, b.y + 44, frame % 30 < 15 ? '#818cf8' : '#c7d2fe', 6)
    drawWindows(ctx, b, b.y + 84, frame % 26 < 13 ? '#38bdf8' : '#22c55e', 6)
    px(ctx, '#1e1b4b', b.x + b.width / 2 - 4, b.y - 52, 8, 36)
    px(ctx, '#c7d2fe', b.x + b.width / 2 - 16, b.y - 58, 32, 8)
    px(ctx, '#312e81', b.x + 28, b.y + 128, 14, 22)
    px(ctx, '#312e81', b.x + 48, b.y + 132, 14, 18)
    px(ctx, '#22c55e', b.x + 32, b.y + 132, 4, 4)
  }

  drawSign(ctx, b)
  drawDoor(ctx, b, led)
}

function drawThread(
  ctx: CanvasRenderingContext2D,
  accepted: boolean,
  frame: number,
  reduced: boolean,
) {
  const from = DOORS.hospital
  const to = DOORS.gp
  if (!from || !to) return
  ctx.lineWidth = 5
  ctx.setLineDash(accepted ? [] : [10, 8])
  ctx.strokeStyle = accepted ? '#16a34a' : '#f59e0b'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.setLineDash([])
  if (!accepted && !reduced) {
    const t = (frame * 2.2) % (to.x - from.x)
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(from.x + t, from.y, 7, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

function drawCharacter(ctx: CanvasRenderingContext2D, c: Character, frame: number, reduced: boolean) {
  const bob = reduced ? 0 : c.moving ? Math.sin(frame * 0.35) * 2.2 : Math.sin(frame * 0.08 + c.x) * 1.4
  const x = Math.round(c.x)
  const y = Math.round(c.y + bob)
  const dir = c.facing
  const step = c.moving && !reduced ? Math.floor(frame / 7) % 2 : 0
  const s = 2

  px(ctx, 'rgba(0,0,0,0.22)', x - 2, y + 34, 28, 7)
  px(ctx, '#0f172a', x + (step === 0 ? 4 : 2) * 1, y + 32, 8, 7)
  px(ctx, '#0f172a', x + (step === 0 ? 16 : 18), y + 32, 8, 7)
  px(ctx, c.spriteColor, x, y + 14, 16 * s, 12 * s)
  if (c.id === 'lab-tech') {
    px(ctx, '#f8fafc', x - 4, y + 14, 40, 24)
    px(ctx, c.spriteColor, x + 8, y + 20, 16, 12)
  }
  if (c.id === 'runner-adk') {
    px(ctx, '#7c2d12', x + (dir === 1 ? 28 : -10), y + 20, 12, 12)
    px(ctx, '#1e293b', x - 2, y - 8, 36, 8)
  }
  if (c.id === 'duty-gp') {
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x + 16, y + 24, 9, Math.PI, 0)
    ctx.stroke()
  }
  if (c.id === 'doctor-morgan') {
    px(ctx, '#f8fafc', x + 20, y + 18, 8, 6)
  }

  px(ctx, '#fed7aa', x + 6, y, 20, 16)
  px(ctx, c.hairColor, x + 4, y - 6, 24, 10)
  px(ctx, '#1e293b', x + (dir === 1 ? 18 : 8), y + 6, 3, 3)
}

function drawBubble(ctx: CanvasRenderingContext2D, bubble: PlacedBubble, hover: boolean) {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)'
  ctx.fillRect(bubble.x + 3, bubble.y + 4, bubble.w, bubble.h)
  ctx.fillStyle = hover ? '#fff7ed' : '#fffef8'
  ctx.strokeStyle = hover ? '#ea580c' : '#0f172a'
  ctx.lineWidth = hover ? 3 : 2
  ctx.fillRect(bubble.x, bubble.y, bubble.w, bubble.h)
  ctx.strokeRect(bubble.x, bubble.y, bubble.w, bubble.h)

  ctx.fillStyle = hover ? '#fff7ed' : '#fffef8'
  ctx.beginPath()
  ctx.moveTo(bubble.pointerX - 6, bubble.y + bubble.h)
  ctx.lineTo(bubble.pointerX, bubble.y + bubble.h + 8)
  ctx.lineTo(bubble.pointerX + 6, bubble.y + bubble.h)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#1d4ed8'
  ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(`[${bubble.author}]:`, bubble.x + 10, bubble.y + 16)
  ctx.fillStyle = '#0f172a'
  ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
  bubble.lines.forEach((line, index) => {
    ctx.fillText(line, bubble.x + 10, bubble.y + 32 + index * 14)
  })
}

function drawMinimap(
  ctx: CanvasRenderingContext2D,
  cam: Point,
  zoom: number,
  view: ViewBox,
  characters: Character[],
) {
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#4ade80'
  ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H)
  const sx = MINIMAP_W / WORLD_W
  const sy = MINIMAP_H / WORLD_H
  ctx.fillStyle = '#d6cbb8'
  for (const road of ROADS) {
    ctx.fillRect(road.x * sx, road.y * sy, Math.max(2, road.w * sx), Math.max(2, road.h * sy))
  }
  for (const b of BUILDINGS) {
    ctx.fillStyle = b.roofColor
    ctx.fillRect(b.x * sx, b.y * sy, b.width * sx, b.height * sy)
  }
  ctx.fillStyle = '#0f172a'
  for (const c of characters) {
    ctx.fillRect(c.x * sx, c.y * sy, 3, 3)
  }
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 2
  ctx.strokeRect(cam.x * sx, cam.y * sy, (view.w / zoom) * sx, (view.h / zoom) * sy)
}

function buildingLed(id: string, ownership: string): string {
  if (ownership === 'ACCEPTED') return id === 'gp' ? '#22c55e' : '#86efac'
  if (id === 'hospital') return '#ef4444'
  if (id === 'gp') return '#f59e0b'
  if (id === 'diagnostics') return '#38bdf8'
  return '#94a3b8'
}

function ownerLabel(teamId: string): string {
  const found = BUILDINGS.find((b) => b.id === teamId || (teamId === 'gp-duty' && b.id === 'gp'))
  return found?.name ?? teamId
}

function isDistrictOwner(buildingId: string, owner: string): boolean {
  if (buildingId === owner) return true
  return buildingId === 'gp' && owner === 'gp-duty'
}

export function PixelTownCanvas({
  data,
  onSelectBuilding,
  onAdvanceClock,
  onCloseLoop,
}: {
  data: TownSimulationData
  onSelectBuilding?: (buildingId: string) => void
  onAdvanceClock?: (minutes: 10 | 30 | 90) => void
  onCloseLoop?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const miniRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const camRef = useRef<Point>({ x: 40, y: 20 })
  const zoomRef = useRef(0.72)
  const viewRef = useRef<ViewBox>({ w: 1200, h: 700, dpr: 1 })
  const charactersRef = useRef<Character[]>(seedCharacters())
  const bubblesRef = useRef<PlacedBubble[]>([])
  const pointerRef = useRef({
    down: false,
    dragging: false,
    sx: 0,
    sy: 0,
    mx: 0,
    my: 0,
    camX: 0,
    camY: 0,
    world: { x: 0, y: 0 },
  })
  const flyRef = useRef<{ x0: number; y0: number; x1: number; y1: number; t: number } | null>(null)
  const ownershipRef = useRef(data.caseStatus.ownershipState)
  const bootedRef = useRef(false)
  const dataRef = useRef(data)
  dataRef.current = data

  const reduced = useReducedMotion()
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const [zoomPct, setZoomPct] = useState(72)

  const syncCameraLabel = useCallback(() => {
    setZoomPct(Math.round(zoomRef.current * 100))
  }, [])

  const applyCamera = useCallback(
    (cam: Point, zoom: number) => {
      const nextZoom = clampZoom(zoom)
      camRef.current = clampCamera(cam.x, cam.y, nextZoom, viewRef.current.w, viewRef.current.h)
      zoomRef.current = nextZoom
      syncCameraLabel()
    },
    [syncCameraLabel],
  )

  const flyTo = useCallback(
    (building: BuildingDef) => {
      const dest = cameraForBuilding(building, zoomRef.current, viewRef.current.w, viewRef.current.h)
      flyRef.current = {
        x0: camRef.current.x,
        y0: camRef.current.y,
        x1: dest.x,
        y1: dest.y,
        t: 0,
      }
      setSelectedBuilding(building.id)
      onSelectBuilding?.(building.id)
    },
    [onSelectBuilding],
  )

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    if (!stage || !canvas) return

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(320, stage.clientWidth)
      const h = Math.max(420, stage.clientHeight)
      viewRef.current = { w, h, dpr }
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      if (!bootedRef.current && w > 400 && h > 280) {
        const seeded = defaultCamera(w, h)
        camRef.current = seeded.cam
        zoomRef.current = seeded.zoom
        bootedRef.current = true
      } else {
        camRef.current = clampCamera(camRef.current.x, camRef.current.y, zoomRef.current, w, h)
      }
      syncCameraLabel()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [syncCameraLabel])

  useEffect(() => {
    const next = data.caseStatus.ownershipState
    if (next !== ownershipRef.current) {
      ownershipRef.current = next
      const runner = charactersRef.current.find((c) => c.id === 'runner-adk')
      if (runner) {
        runner.path = runnerPathFor(next)
        runner.loop = next === 'ORDERER_OWNS'
        const first = runner.path[0]
        if (first) {
          runner.targetX = first.x
          runner.targetY = first.y
        }
      }
    }
  }, [data.caseStatus.ownershipState])

  useEffect(() => {
    const canvas = canvasRef.current
    const mini = miniRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const miniCtx = mini?.getContext('2d')
    if (!ctx) return

    let frame = 0
    let raf = 0
    let wanderTick = 0

    const render = () => {
      frame += 1
      const view = viewRef.current
      const live = dataRef.current
      const zoom = zoomRef.current

      const fly = flyRef.current
      if (fly && !reduced) {
        fly.t += 0.045
        const t = Math.min(1, fly.t)
        const ease = 1 - (1 - t) ** 3
        camRef.current = clampCamera(
          fly.x0 + (fly.x1 - fly.x0) * ease,
          fly.y0 + (fly.y1 - fly.y0) * ease,
          zoom,
          view.w,
          view.h,
        )
        if (t >= 1) flyRef.current = null
      } else if (fly && reduced) {
        camRef.current = clampCamera(fly.x1, fly.y1, zoom, view.w, view.h)
        flyRef.current = null
      }

      const cam = camRef.current
      const speech = composeCharacterSpeech(live)
      const characters = charactersRef.current
      wanderTick += 1

      for (const c of characters) {
        if (c.id !== 'runner-adk' && wanderTick % 240 === c.name.length * 12) {
          const door = DOORS[c.homeId]
          if (door) {
            c.targetX = door.x + ((frame + c.x) % 40) - 20
            c.targetY = door.y - 20
          }
        }

        const speed = c.id === 'runner-adk' ? 1.55 : 0.45
        const stepped = stepAlongPath({ x: c.x, y: c.y }, { x: c.targetX, y: c.targetY }, speed)
        c.moving = !stepped.arrived
        if (c.x !== stepped.next.x) c.facing = stepped.next.x >= c.x ? 1 : -1
        c.x = stepped.next.x
        c.y = stepped.next.y
        if (stepped.arrived) {
          if (c.path.length > 0) {
            const arrived = c.path.shift()
            if (c.loop && arrived) c.path.push(arrived)
            const next = c.path[0]
            if (next) {
              c.targetX = next.x
              c.targetY = next.y
            }
          }
        }
      }

      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, view.w, view.h)
      ctx.save()
      ctx.scale(zoom, zoom)
      ctx.translate(-cam.x, -cam.y)

      drawGrass(ctx, cam, zoom, view)
      drawRoads(ctx)
      drawDecor(ctx, frame, reduced)
      drawThread(ctx, live.caseStatus.ownershipState === 'ACCEPTED', frame, reduced)

      const hoverWorld = pointerRef.current.world
      const hoverBuilding = hitTestBuilding(hoverWorld.x, hoverWorld.y)
      for (const b of BUILDINGS) {
        drawBuilding(
          ctx,
          b,
          selectedBuilding === b.id || hoverBuilding?.id === b.id,
          frame,
          buildingLed(b.id, live.caseStatus.ownershipState),
        )
      }
      for (const c of characters) drawCharacter(ctx, c, frame, reduced)
      ctx.restore()

      const screenObstacles = [
        ...BUILDINGS.map((b) => {
          const top = worldToScreen(b.x - 8, b.y - 56, cam.x, cam.y, zoom)
          return {
            x: top.x,
            y: top.y,
            w: (b.width + 16) * zoom,
            h: (b.height + 64) * zoom,
          }
        }),
        { x: 0, y: 0, w: 188, h: view.h },
        { x: view.w - 248, y: view.h - 186, w: 248, h: 186 },
        ...(selectedBuilding ? [{ x: view.w - 360, y: 0, w: 360, h: 340 }] : []),
      ]
      const requests = characters.flatMap((c) => {
        const screen = worldToScreen(c.x + 16, c.y - 6, cam.x, cam.y, zoom)
        if (screen.x < -20 || screen.x > view.w + 20 || screen.y < -20 || screen.y > view.h + 40) {
          return []
        }
        return [
          {
            id: c.id,
            anchorX: screen.x,
            anchorY: screen.y,
            author: c.name.split(' ')[0] ?? c.name,
            text: speech[c.id] ?? '',
          },
        ]
      })
      const bubbles = layoutSpeechBubbles(requests, screenObstacles, { w: view.w, h: view.h })
      bubblesRef.current = bubbles
      const hoverBubble = hitTestBubble(pointerRef.current.mx, pointerRef.current.my, bubbles)
      for (const bubble of bubbles) drawBubble(ctx, bubble, hoverBubble?.id === bubble.id)

      if (miniCtx) {
        miniCtx.setTransform(1, 0, 0, 1, 0, 0)
        drawMinimap(miniCtx, cam, zoom, view, characters)
      }

      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [reduced, selectedBuilding])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const sx = event.clientX - rect.left
      const sy = event.clientY - rect.top
      if (Math.abs(event.deltaY) < 2) return
      const factor = event.deltaY > 0 ? 0.93 : 1.07
      const next = zoomAround(
        sx,
        sy,
        camRef.current.x,
        camRef.current.y,
        zoomRef.current,
        zoomRef.current * factor,
        viewRef.current.w,
        viewRef.current.h,
      )
      applyCamera(next.cam, next.zoom)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [applyCamera])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return
      }
      const view = viewRef.current
      const step = 36 / zoomRef.current
      if (event.key === 'ArrowLeft') {
        applyCamera({ x: camRef.current.x - step, y: camRef.current.y }, zoomRef.current)
      } else if (event.key === 'ArrowRight') {
        applyCamera({ x: camRef.current.x + step, y: camRef.current.y }, zoomRef.current)
      } else if (event.key === 'ArrowUp') {
        applyCamera({ x: camRef.current.x, y: camRef.current.y - step }, zoomRef.current)
      } else if (event.key === 'ArrowDown') {
        applyCamera({ x: camRef.current.x, y: camRef.current.y + step }, zoomRef.current)
      } else if (event.key === '+' || event.key === '=') {
        const next = zoomAround(
          view.w / 2,
          view.h / 2,
          camRef.current.x,
          camRef.current.y,
          zoomRef.current,
          zoomRef.current * 1.15,
          view.w,
          view.h,
        )
        applyCamera(next.cam, next.zoom)
      } else if (event.key === '-' || event.key === '_') {
        const next = zoomAround(
          view.w / 2,
          view.h / 2,
          camRef.current.x,
          camRef.current.y,
          zoomRef.current,
          zoomRef.current / 1.15,
          view.w,
          view.h,
        )
        applyCamera(next.cam, next.zoom)
      } else if (event.key === '0') {
        const seeded = defaultCamera(view.w, view.h)
        applyCamera(seeded.cam, seeded.zoom)
      } else if (event.key === 'Escape') {
        setSelectedBuilding(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyCamera])

  const toCanvas = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { sx: 0, sy: 0, world: { x: 0, y: 0 } }
    const rect = canvas.getBoundingClientRect()
    const sx = event.clientX - rect.left
    const sy = event.clientY - rect.top
    return {
      sx,
      sy,
      world: screenToWorld(sx, sy, camRef.current.x, camRef.current.y, zoomRef.current),
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const pos = toCanvas(event)
    pointerRef.current = {
      down: true,
      dragging: false,
      sx: pos.sx,
      sy: pos.sy,
      mx: pos.sx,
      my: pos.sy,
      camX: camRef.current.x,
      camY: camRef.current.y,
      world: pos.world,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = toCanvas(event)
    pointerRef.current.world = pos.world
    pointerRef.current.mx = pos.sx
    pointerRef.current.my = pos.sy
    if (!pointerRef.current.down) return
    const dx = pos.sx - pointerRef.current.sx
    const dy = pos.sy - pointerRef.current.sy
    if (!pointerRef.current.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      pointerRef.current.dragging = true
      setPanning(true)
      flyRef.current = null
    }
    if (pointerRef.current.dragging) {
      applyCamera(
        {
          x: pointerRef.current.camX - dx / zoomRef.current,
          y: pointerRef.current.camY - dy / zoomRef.current,
        },
        zoomRef.current,
      )
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = toCanvas(event)
    const wasDrag = pointerRef.current.dragging
    pointerRef.current.down = false
    pointerRef.current.dragging = false
    setPanning(false)
    if (wasDrag) return

    const bubble = hitTestBubble(pos.sx, pos.sy, bubblesRef.current)
    if (bubble) {
      const character = charactersRef.current.find((c) => c.id === bubble.id)
      if (character) {
        setSelectedBuilding(character.homeId)
        onSelectBuilding?.(character.homeId)
      }
      return
    }
    const building = hitTestBuilding(pos.world.x, pos.world.y)
    if (building) {
      setSelectedBuilding(building.id)
      onSelectBuilding?.(building.id)
    }
  }

  const nudgeZoom = (factor: number) => {
    const view = viewRef.current
    const next = zoomAround(
      view.w / 2,
      view.h / 2,
      camRef.current.x,
      camRef.current.y,
      zoomRef.current,
      zoomRef.current * factor,
      view.w,
      view.h,
    )
    applyCamera(next.cam, next.zoom)
  }

  const handleMinimapClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const mini = miniRef.current
    if (!mini) return
    const rect = mini.getBoundingClientRect()
    const wx = ((event.clientX - rect.left) / rect.width) * WORLD_W
    const wy = ((event.clientY - rect.top) / rect.height) * WORLD_H
    const view = viewRef.current
    applyCamera(
      {
        x: wx - view.w / zoomRef.current / 2,
        y: wy - view.h / zoomRef.current / 2,
      },
      zoomRef.current,
    )
  }

  const selected = BUILDINGS.find((b) => b.id === selectedBuilding)
  const district = selected ? data.districts?.[selected.id] : undefined
  const lab = data.patient.recentLab
  const recentForDrawer = data.recentEvents.slice(0, 4)

  return (
    <div className={styles.townContainer}>
      <div className={styles.townHeaderBar}>
        <div className={styles.townHeaderLeft}>
          <div className={styles.townTitle}>
            <span className={styles.pixelDot} />
            <span>Smallville Live Simulator: Close The Loop</span>
          </div>
          <div className={styles.townSubtitle}>
            16-bit multi-agent town · {WORLD_W}×{WORLD_H} world · drag terrain to pan · wheel to zoom
          </div>
        </div>
        <div className={styles.townHeaderActions}>
          <div className={styles.clockPill}>
            <span>Simulator clock</span>
            <strong>
              {new Date(data.clock.now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </strong>
            {data.clock.paused ? <span>paused</span> : null}
          </div>
          <button className={styles.clockBtn} type="button" onClick={() => onAdvanceClock?.(10)}>
            +10m
          </button>
          <button className={styles.clockBtn} type="button" onClick={() => onAdvanceClock?.(30)}>
            +30m
          </button>
          <button className={styles.clockBtn} type="button" onClick={() => onAdvanceClock?.(90)}>
            +90m
          </button>
          <button
            className={styles.closeLoopBtn}
            type="button"
            onClick={onCloseLoop}
            title="Submit the supported Anima write to close the covenant loop"
          >
            Close the loop
          </button>
        </div>
      </div>

      <div ref={stageRef} className={`${styles.stage} ${panning ? styles.panning : ''}`}>
        <canvas
          ref={canvasRef}
          className={styles.pixelCanvas}
          aria-label="Expansive 16-bit care town. Drag to pan, scroll to zoom, click a building for live status."
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            pointerRef.current.down = false
            pointerRef.current.dragging = false
            setPanning(false)
          }}
        />

        <div className={styles.hud}>
          <div className={styles.zoomStack}>
            <button className={styles.zoomBtn} type="button" aria-label="Zoom in" onClick={() => nudgeZoom(1.15)}>
              +
            </button>
            <button className={styles.zoomBtn} type="button" aria-label="Zoom out" onClick={() => nudgeZoom(1 / 1.15)}>
              −
            </button>
            <button
              className={styles.resetBtn}
              type="button"
              aria-label="Reset camera"
              onClick={() => {
                const seeded = defaultCamera(viewRef.current.w, viewRef.current.h)
                applyCamera(seeded.cam, seeded.zoom)
              }}
            >
              {zoomPct}%
            </button>
          </div>
          <div className={styles.hint}>
            Drag anywhere on the terrain to travel. Click a district or speech bubble for live simulator status.
          </div>
          <div className={styles.districtRail} aria-label="Fly to district">
            {BUILDINGS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`${styles.navChip} ${selectedBuilding === b.id ? styles.navChipActive : ''}`}
                onClick={() => flyTo(b)}
              >
                <span>{b.icon}</span>
                <span>{b.short}</span>
              </button>
            ))}
          </div>
          <div className={styles.minimapWrap}>
            <div className={styles.minimapLabel}>TOWN MAP</div>
            <canvas
              ref={miniRef}
              className={styles.minimap}
              width={MINIMAP_W}
              height={MINIMAP_H}
              aria-label="Minimap of the full town. Click to jump the camera."
              onClick={handleMinimapClick}
            />
          </div>

          {selected && (
            <aside className={styles.inspectorDrawer} aria-live="polite">
              <div className={styles.drawerHeader}>
                <span className={styles.drawerIcon}>{selected.icon}</span>
                <div>
                  <h4>{selected.name}</h4>
                  <div className={styles.drawerRole}>{selected.role}</div>
                </div>
                <button className={styles.drawerClose} type="button" onClick={() => setSelectedBuilding(null)}>
                  ✕
                </button>
              </div>
              <div className={styles.drawerBody}>
                <div className={styles.drawerRow}>
                  <span>Live status</span>
                  <strong>{district?.status ?? 'Standing by'}</strong>
                </div>
                <div className={styles.drawerRow}>
                  <span>Current owner</span>
                  <strong>
                    {isDistrictOwner(selected.id, data.caseStatus.currentOwner)
                      ? 'Accountable on this case'
                      : ownerLabel(data.caseStatus.currentOwner)}
                  </strong>
                </div>
                <div className={styles.drawerRow}>
                  <span>Closure</span>
                  <strong>{data.caseStatus.closureState}</strong>
                </div>
                <div className={styles.drawerAlert}>
                  {selected.id === 'hospital' && (
                    <>
                      <strong>Acute desk:</strong> {labPhraseDrawer(lab)} Ownership stays here until a named
                      receiver accepts.
                    </>
                  )}
                  {selected.id === 'diagnostics' && (
                    <>
                      <strong>Assay bench:</strong> {lab.name} {lab.value} {lab.unit} released to the ordering
                      team. {district?.recentEvent ?? ''}
                    </>
                  )}
                  {selected.id === 'gp' && (
                    <>
                      <strong>Duty GP:</strong>{' '}
                      {data.caseStatus.ownershipState === 'ACCEPTED'
                        ? 'Handover accepted. Review is scheduled on the destination record.'
                        : 'Awaiting an explicit acceptance before this practice becomes owner.'}
                    </>
                  )}
                  {selected.id === 'patient' && (
                    <>
                      <strong>{data.patient.name}:</strong>{' '}
                      {data.patient.observations?.[0]?.detail ??
                        'Home monitor connected. No invented vitals are shown.'}
                    </>
                  )}
                  {selected.id === 'pharmacy' && (
                    <>
                      <strong>Dispensary:</strong> {district?.recentEvent ?? 'Repeat-script queue is standing by.'}
                    </>
                  )}
                  {selected.id === 'community' && (
                    <>
                      <strong>Pavilion:</strong>{' '}
                      {district?.recentEvent ?? 'Step-down garden is open. No rehab outcome is inferred.'}
                    </>
                  )}
                  {selected.id === 'referrals' && (
                    <>
                      <strong>Suites:</strong>{' '}
                      {district?.recentEvent ?? 'No specialist referral has been opened for this result.'}
                    </>
                  )}
                  {selected.id === 'wearables' && (
                    <>
                      <strong>Telemetry:</strong>{' '}
                      {district?.recentEvent ??
                        data.patient.observations?.[0]?.detail ??
                        'Wearable stream connected. Values appear only when the simulator returns them.'}
                    </>
                  )}
                </div>
                {recentForDrawer.length > 0 && (
                  <div className={styles.eventList}>
                    {recentForDrawer.map((event, index) => (
                      <div key={event.id ?? `${event.type}-${index}`} className={styles.eventItem}>
                        [{event.actor ?? 'simulation'}] {event.detail ?? event.type}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      <div className={styles.eventTicker}>
        <span className={styles.tickerBadge}>LIVE EHR STREAM</span>
        <div className={styles.tickerText}>
          {data.recentEvents.length > 0
            ? data.recentEvents.slice(0, 3).map((event, index) => (
                <span key={event.id ?? index} className={styles.tickerItem}>
                  [{event.actor ?? 'simulation'}]: {event.detail} •{' '}
                </span>
              ))
            : 'Streaming synthetic clinical and flow events from the Anima simulator…'}
        </div>
      </div>
    </div>
  )
}

function labPhraseDrawer(lab: TownSimulationData['patient']['recentLab']): string {
  const range = lab.refLow != null && lab.refHigh != null ? ` (source range ${lab.refLow}–${lab.refHigh})` : ''
  return `${lab.name} ${lab.value} ${lab.unit}${lab.isAbnormal ? ' is outside the source range' : ' is inside the source range'}${range}.`
}
