/**
 * The shapes that ship with the tool.
 *
 * Each is one SVG path string, which is the whole point: the same string draws the
 * swatch in the panel and, through `Path2D`, rasterises the mask the material is
 * cut from. One source of truth, so a swatch can never disagree with the sticker
 * it produces.
 *
 * The set is chosen to exercise the pipeline rather than to look like a clipart
 * tray: fine points, hard corners, deep concavity, a true hole, and smooth curves.
 */

export interface Shape {
  id: string
  name: string
  path: string
  /** Holes need even-odd; everything else is nonzero. */
  evenOdd?: boolean
}

/** The paths are authored in this square. */
export const SHAPE_VIEWBOX = 200

const rad = (deg: number) => (deg * Math.PI) / 180
const polar = (cx: number, cy: number, deg: number, r: number) =>
  [cx + Math.cos(rad(deg)) * r, cy + Math.sin(rad(deg)) * r] as const
const n = (v: number) => Math.round(v * 100) / 100

/**
 * A four-point gleam with a deep concave waist. Tip radii run clockwise from the
 * top and are deliberately unequal — a perfectly symmetrical sparkle reads as a
 * geometric primitive rather than a drawn mark.
 */
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

/** Alternating outer and inner radii. */
function star(cx: number, cy: number, points: number, outer: number, inner: number) {
  let d = ''
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const [x, y] = polar(cx, cy, -90 + (i * 180) / points, r)
    d += `${i === 0 ? 'M' : ' L'}${n(x)},${n(y)}`
  }
  return `${d} Z`
}

/** Rounded petals around a small hub. */
function bloom(cx: number, cy: number, petals: number, tipR: number, hubR: number) {
  const step = 360 / petals
  const half = step / 2
  let d = ''
  for (let i = 0; i < petals; i++) {
    const a = -90 + i * step
    const base1 = polar(cx, cy, a - half * 0.9, hubR)
    const base2 = polar(cx, cy, a + half * 0.9, hubR)
    const tip = polar(cx, cy, a, tipR)
    const c1 = polar(cx, cy, a - half * 1.05, tipR * 0.88)
    const c2 = polar(cx, cy, a + half * 1.05, tipR * 0.88)
    d += `${i === 0 ? 'M' : ' L'}${n(base1[0])},${n(base1[1])}`
    d += ` Q${n(c1[0])},${n(c1[1])} ${n(tip[0])},${n(tip[1])}`
    d += ` Q${n(c2[0])},${n(c2[1])} ${n(base2[0])},${n(base2[1])}`
  }
  return `${d} Z`
}

/** A full circle as two half arcs, which every path parser agrees on. */
function circle(cx: number, cy: number, r: number, clockwise = true) {
  const sweep = clockwise ? 1 : 0
  return (
    `M${n(cx - r)},${n(cy)} ` +
    `A${r},${r} 0 1 ${sweep} ${n(cx + r)},${n(cy)} ` +
    `A${r},${r} 0 1 ${sweep} ${n(cx - r)},${n(cy)} Z`
  )
}

export const SHAPES: Shape[] = [
  {
    id: 'sparkle',
    name: 'Sparkle',
    // Three at descending scale: it puts a broad field and a fine point under the
    // same light, which is the honest test of the material.
    path: [
      sparkle(86, 106, 82, [1, 0.58, 0.8, 0.58], 0.15),
      sparkle(160, 44, 33, [1, 0.62, 0.72, 0.62], 0.16),
      sparkle(172, 142, 14, [1, 0.66, 0.86, 0.66], 0.18),
    ].join(' '),
  },
  {
    id: 'star',
    name: 'Star',
    path: star(100, 102, 5, 90, 37),
  },
  {
    id: 'bolt',
    name: 'Bolt',
    path: 'M124,8 L40,110 L86,110 L70,192 L162,78 L112,78 Z',
  },
  {
    id: 'heart',
    name: 'Heart',
    path:
      'M100,182 C100,182 14,124 14,70 C14,38 40,16 68,16 ' +
      'C84,16 96,26 100,40 C104,26 116,16 132,16 ' +
      'C160,16 186,38 186,70 C186,124 100,182 100,182 Z',
  },
  {
    id: 'ring',
    name: 'Ring',
    // A genuine hole, so the die cut has an inner contour to follow too.
    path: `${circle(100, 100, 88)} ${circle(100, 100, 38, false)}`,
    evenOdd: true,
  },
  {
    id: 'bloom',
    name: 'Bloom',
    path: bloom(100, 100, 6, 90, 26),
  },
]

export function shapeById(id: string): Shape {
  return SHAPES.find((s) => s.id === id) ?? SHAPES[0]
}

/**
 * Rasterise a shape for the mask pipeline: black on white, at a size that gives
 * the distance field room to resolve fine points.
 */
export function drawShape(shape: Shape, size = 1000): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  const scale = size / SHAPE_VIEWBOX
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = '#000000'
  ctx.fill(new Path2D(shape.path), shape.evenOdd ? 'evenodd' : 'nonzero')

  return canvas
}
