/**
 * The shape waiting in the canvas before anything is uploaded. Drawn here rather
 * than shipped as an asset so it rasterises at whatever resolution the mask
 * wants, and so it goes through exactly the same pipeline an upload does.
 *
 * A four-point gleam with a deep concave waist, plus two companions at
 * decreasing scale. The size contrast is deliberate: it puts a broad field and a
 * fine point under the same light, which is the honest test of the material.
 */

const SIZE = 1000

interface Sparkle {
  x: number
  y: number
  radius: number
  /** Per-tip radius multipliers, clockwise from the top. */
  tips: [number, number, number, number]
  waist: number
  rotation: number
}

const COMPOSITION: Sparkle[] = [
  {
    x: 0.44,
    y: 0.54,
    radius: 0.42,
    tips: [1, 0.58, 0.8, 0.58],
    waist: 0.15,
    rotation: 0,
  },
  {
    x: 0.8,
    y: 0.22,
    radius: 0.17,
    tips: [1, 0.62, 0.72, 0.62],
    waist: 0.16,
    rotation: -0.16,
  },
  {
    x: 0.86,
    y: 0.7,
    radius: 0.072,
    tips: [1, 0.66, 0.86, 0.66],
    waist: 0.18,
    rotation: 0.32,
  },
]

function traceSparkle(ctx: CanvasRenderingContext2D, s: Sparkle) {
  const cx = s.x * SIZE
  const cy = s.y * SIZE
  const r = s.radius * SIZE
  const waist = s.waist * r

  // Tips at 12, 3, 6, 9 o'clock; control points on the diagonals pulled deep
  // towards the centre so the sides sweep inwards instead of running straight.
  const tipAt = (i: number) => {
    const a = s.rotation - Math.PI / 2 + i * (Math.PI / 2)
    const rr = r * s.tips[i]
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr] as const
  }
  const waistAt = (i: number) => {
    const a = s.rotation - Math.PI / 4 + i * (Math.PI / 2)
    return [cx + Math.cos(a) * waist, cy + Math.sin(a) * waist] as const
  }

  ctx.beginPath()
  const start = tipAt(0)
  ctx.moveTo(start[0], start[1])
  for (let i = 0; i < 4; i++) {
    const w = waistAt(i)
    const next = tipAt((i + 1) % 4)
    ctx.quadraticCurveTo(w[0], w[1], next[0], next[1])
  }
  ctx.closePath()
}

export function drawDemoArtwork(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.fillStyle = '#000000'
  for (const sparkle of COMPOSITION) {
    traceSparkle(ctx, sparkle)
    ctx.fill()
  }
  return canvas
}
