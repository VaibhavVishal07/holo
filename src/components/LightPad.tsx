import { useEffect, useRef } from 'react'
import { lightHandle } from '../scene/handle'
import { useStore } from '../state/store'

/**
 * Where the light is.
 *
 * Two sliders would technically place a light, but a light has a position, and the
 * control for a position is a position. Dragging in the pad moves it directly; the
 * dot is also a live readout, so while the light is tracking the pointer you can
 * watch it travel and see what the material is responding to.
 *
 * The readout runs off the render loop and writes to the DOM, never to React —
 * a light that moves every frame must not cost a render every frame. Keyboard and
 * assistive access come from two real range inputs behind the pad rather than from
 * ARIA describing a div.
 */
export function LightPad() {
  const pad = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLSpanElement>(null)
  const lightX = useStore((s) => s.lightX)
  const lightY = useStore((s) => s.lightY)
  const follow = useStore((s) => s.lightFollow)
  const set = useStore((s) => s.set)

  // Live readout. When the light is placed by hand the store is already the
  // truth, but the engine still eases towards it, so the same loop shows both.
  useEffect(() => {
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const live = lightHandle.current
      if (!live || !dot.current) return
      // The engine works in studio units where the resting light sits up and to
      // the right; the pad is a plain -1..1 square, so it is mapped back here.
      const x = clamp((live.x - 0.34) / 1.1, -1, 1)
      const y = clamp((live.y - 0.4) / 1.1, -1, 1)
      dot.current.style.left = `${(x * 0.5 + 0.5) * 100}%`
      dot.current.style.top = `${(0.5 - y * 0.5) * 100}%`
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const place = (event: PointerEvent | React.PointerEvent) => {
    const el = pad.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = clamp(((event.clientX - r.left) / r.width - 0.5) * 2, -1, 1)
    const y = clamp((0.5 - (event.clientY - r.top) / r.height) * 2, -1, 1)
    set('lightX', x)
    set('lightY', y)
    // Placing the light by hand is a clear statement that it should stay there.
    if (follow) set('lightFollow', false)
  }

  return (
    <div
      className="light-pad"
      ref={pad}
      onPointerDown={(event) => {
        ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
        place(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) place(event)
      }}
    >
      <span className="light-pad-cross" aria-hidden="true" />
      <span className="light-pad-dot" ref={dot} aria-hidden="true" />
      <input
        type="range"
        className="light-pad-axis"
        min={-1}
        max={1}
        step={0.02}
        value={lightX}
        aria-label="Light horizontal"
        onChange={(event) => {
          set('lightX', Number(event.target.value))
          if (follow) set('lightFollow', false)
        }}
      />
      <input
        type="range"
        className="light-pad-axis"
        min={-1}
        max={1}
        step={0.02}
        value={lightY}
        aria-label="Light vertical"
        onChange={(event) => {
          set('lightY', Number(event.target.value))
          if (follow) set('lightFollow', false)
        }}
      />
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
