/**
 * The shape waiting on the canvas before anything is uploaded.
 *
 * One SVG path string, rasterised through `Path2D` and pushed through exactly the
 * same pipeline an upload takes — so nothing about it is a special case, and it is
 * an honest preview of what the tool does.
 *
 * A four-point gleam with a deep concave waist, in three descending sizes. The
 * size contrast is deliberate: it puts a broad field and a fine point under the
 * same light, which is the real test of the material.
 */

const VIEWBOX = 200

const rad = (deg: number) => (deg * Math.PI) / 180
const polar = (cx: number, cy: number, deg: number, r: number) =>
  [cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r] as const
const n = (v: number) => Math.round(v * 100) / 100

/** Tip radii run clockwise from the top; unequal, so it reads as drawn. */
function sparkle(
  cx: number,
  cy: number,
  r: number,
  tips: [number, number, number, number],
  waist: number,
): string {
  const tip = (i: number) => polar(cx, cy, -90 + i * 90, r * tips[i])
  const dip = (i: number) => polar(cx, cy, -45 + i * 90, r * waist)
  const start = tip(0)
  let d = `M${n(start[0])},${n(start[1])}`
  for (let i = 0; i < 4; i++) {
    const w = dip(i)
    const next = tip((i + 1) % 4)
    d += ` Q${n(w[0])},${n(w[1])} ${n(next[0])},${n(next[1])}`
  }
  return `${d} Z`
}

const PATH = [
  sparkle(86, 106, 82, [1, 0.58, 0.8, 0.58], 0.15),
  sparkle(160, 44, 33, [1, 0.62, 0.72, 0.62], 0.16),
  sparkle(172, 142, 14, [1, 0.66, 0.86, 0.86], 0.18),
].join(' ')

/** Black on white, at a size that lets the distance field resolve fine points. */
export function drawDemoShape(size = 1000): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  const scale = size / VIEWBOX
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = '#000000'
  ctx.fill(new Path2D(PATH))

  return canvas
}
