import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * The object's mass.
 *
 * Rotation is never bound to the pointer. The pointer moves a target; a spring
 * chases it. That single indirection is the difference between a CSS transform
 * and something that feels like it is being held — the surface arrives a beat
 * late, overshoots a hair, and settles.
 *
 * The virtual light is driven from the same pointer but through a different
 * mapping and a slower spring, so the highlight is never parked under the cursor.
 */

const DEG = Math.PI / 180

const MAX_HOVER_X = 8.5 * DEG
const MAX_HOVER_Y = 11 * DEG
/** Dragging can reach further than hovering, but not far enough to show the back. */
const MAX_DRAG_X = 26 * DEG
const MAX_DRAG_Y = 32 * DEG

const IDLE_AFTER = 1.5

export interface TiltInput {
  auto: boolean
  reduceMotion: boolean
  /** Where the light sits when it is not tracking the pointer, -1..1. */
  lightX: number
  lightY: number
  lightFollow: boolean
}

export class TiltEngine {
  rotX = 0
  rotY = 0
  lightX = 0.3
  lightY = 0.62

  auto = false
  reduceMotion = false
  /** The placed light position, used when `lightFollow` is off. */
  placedLightX = 0.34
  placedLightY = 0.4
  lightFollow = true

  /** Pointer in sticker-relative units: x right, y up, roughly -1..1. */
  private px = 0
  private py = 0
  private hovering = false
  private lastInput = -Infinity

  private velX = 0
  private velY = 0
  private dragX = 0
  private dragY = 0
  private dragVelX = 0
  private dragVelY = 0
  private lightVelX = 0
  private lightVelY = 0

  dragging = false
  private time = 0
  /** 0 while the pointer is engaged, 1 once the object has been left alone. */
  private idleMix = 1

  setPointer(x: number, y: number) {
    this.px = x
    this.py = y
    this.hovering = true
    this.lastInput = this.time
  }

  clearPointer() {
    this.hovering = false
    this.lastInput = this.time
  }

  beginDrag() {
    this.dragging = true
    this.dragX = this.rotX
    this.dragY = this.rotY
    this.dragVelX = 0
    this.dragVelY = 0
    this.lastInput = this.time
  }

  /** `dx`/`dy` are pointer deltas in pixels, y measured downwards. */
  drag(dx: number, dy: number, dt: number) {
    const gain = 0.26 * DEG
    const ax = dy * gain
    const ay = dx * gain
    this.dragX = clamp(this.dragX + ax, -MAX_DRAG_X, MAX_DRAG_X)
    this.dragY = clamp(this.dragY + ay, -MAX_DRAG_Y, MAX_DRAG_Y)
    if (dt > 0) {
      this.dragVelX = ax / dt
      this.dragVelY = ay / dt
    }
    this.lastInput = this.time
  }

  endDrag() {
    this.dragging = false
    // A little residual momentum, then the spring takes over. Deliberately
    // under-scaled: the object should coast, never spin.
    this.velX += clamp(this.dragVelX, -6, 6) * 0.22
    this.velY += clamp(this.dragVelY, -6, 6) * 0.22
    this.lastInput = this.time
  }

  update(dt: number) {
    const step = Math.min(dt, 1 / 30)
    this.time += step

    const idle = this.time - this.lastInput > IDLE_AFTER && !this.dragging
    this.idleMix += ((idle ? 1 : 0) - this.idleMix) * Math.min(1, step * 1.4)

    let targetX: number
    let targetY: number

    if (this.dragging) {
      targetX = this.dragX
      targetY = this.dragY
    } else {
      const hoverX = this.hovering ? -this.py * MAX_HOVER_X : 0
      const hoverY = this.hovering ? this.px * MAX_HOVER_Y : 0

      // Never returns to a dead 0,0 — it drifts, the way a hand-held object does.
      const breatheX = this.reduceMotion ? 0 : this.breathe(0.31, 0.13, 0, 1.1, 1.05 * DEG)
      const breatheY = this.reduceMotion ? 0 : this.breathe(0.24, 0.41, 2.2, 0.5, 1.7 * DEG)

      targetX = lerp(hoverX, breatheX, this.idleMix)
      targetY = lerp(hoverY, breatheY, this.idleMix)

      if (this.auto && !this.reduceMotion) {
        // -3deg to +4deg on X, -5deg to +5deg on Y, over incommensurate periods
        // of about 8s and 14s, so the cycle never lands on itself.
        const ax = 0.5 + 0.5 * (0.62 * Math.sin(this.time * 0.756) +
          0.38 * Math.sin(this.time * 0.463 + 1.7))
        const ay = 0.5 + 0.5 * (0.58 * Math.sin(this.time * 0.618 + 0.4) +
          0.42 * Math.sin(this.time * 0.371 + 2.9))
        const autoX = lerp(-3 * DEG, 4 * DEG, ax)
        const autoY = lerp(-5 * DEG, 5 * DEG, ay)
        // The pointer still has authority; auto motion is the bed underneath it.
        targetX = autoX + targetX * 0.62
        targetY = autoY + targetY * 0.62
      }
    }

    const stiffness = this.dragging ? 260 : 78
    const damping = this.dragging ? 26 : 12.2

    this.velX += (stiffness * (targetX - this.rotX) - damping * this.velX) * step
    this.velY += (stiffness * (targetY - this.rotY) - damping * this.velY) * step
    this.rotX += this.velX * step
    this.rotY += this.velY * step

    // The light lives on its own mapping and its own, slacker spring. When it
    // tracks the pointer the mapping is offset, so the key never sits exactly
    // where the cursor is; when it has been placed by hand, the placed position is
    // authoritative and only the object's own rotation still moves it.
    const lightTargetX = this.lightFollow
      ? 0.34 + (this.hovering ? this.px * 0.72 : 0) + this.rotY * 0.9
      : this.placedLightX + this.rotY * 0.5
    const lightTargetY = this.lightFollow
      ? 0.66 + (this.hovering ? this.py * 0.5 : 0) - this.rotX * 0.9
      : this.placedLightY - this.rotX * 0.5
    const lk = 34
    const ld = 9.4
    this.lightVelX += (lk * (lightTargetX - this.lightX) - ld * this.lightVelX) * step
    this.lightVelY += (lk * (lightTargetY - this.lightY) - ld * this.lightVelY) * step
    this.lightX += this.lightVelX * step
    this.lightY += this.lightVelY * step
  }

  private breathe(f1: number, f2: number, ph1: number, ph2: number, amp: number) {
    return (
      (Math.sin(this.time * f1 + ph1) * 0.62 + Math.sin(this.time * f2 + ph2) * 0.38) * amp
    )
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/**
 * Binds an element's pointer and touch input to a `TiltEngine`. Nothing here
 * causes a React render; the engine is read inside the render loop.
 */
export function useTilt(
  targetRef: React.RefObject<HTMLElement | null>,
  input: TiltInput,
) {
  const engine = useMemo(() => new TiltEngine(), [])
  const grabbing = useRef(false)

  engine.auto = input.auto
  engine.reduceMotion = input.reduceMotion
  engine.placedLightX = input.lightX
  engine.placedLightY = input.lightY
  engine.lightFollow = input.lightFollow

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    let last = { x: 0, y: 0, t: 0 }
    let pointerId: number | null = null

    const relative = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      // Normalised against the shorter axis so the response feels the same
      // whatever shape the window is.
      const unit = Math.min(r.width, r.height) * 0.62
      return {
        x: (e.clientX - (r.left + r.width / 2)) / unit,
        y: -(e.clientY - (r.top + r.height / 2)) / unit,
      }
    }

    const onMove = (e: PointerEvent) => {
      if (pointerId !== null && e.pointerId === pointerId) {
        const now = e.timeStamp / 1000
        engine.drag(e.clientX - last.x, e.clientY - last.y, now - last.t)
        last = { x: e.clientX, y: e.clientY, t: now }
        return
      }
      if (e.pointerType === 'touch') return
      const p = relative(e)
      engine.setPointer(clamp(p.x, -1.6, 1.6), clamp(p.y, -1.6, 1.6))
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      pointerId = e.pointerId
      last = { x: e.clientX, y: e.clientY, t: e.timeStamp / 1000 }
      grabbing.current = true
      el.setPointerCapture(e.pointerId)
      el.dataset.grabbing = 'true'
      engine.beginDrag()
      if (e.pointerType === 'touch') {
        const p = relative(e)
        engine.setPointer(clamp(p.x, -1.6, 1.6), clamp(p.y, -1.6, 1.6))
      }
    }

    const onUp = (e: PointerEvent) => {
      if (pointerId === null || e.pointerId !== pointerId) return
      pointerId = null
      grabbing.current = false
      delete el.dataset.grabbing
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      engine.endDrag()
      if (e.pointerType === 'touch') engine.clearPointer()
    }

    const onLeave = () => {
      if (pointerId === null) engine.clearPointer()
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('pointerleave', onLeave)

    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [engine, targetRef])

  return engine
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}
