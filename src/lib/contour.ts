/**
 * Tracing the die-cut outline out of the distance field.
 *
 * The sticker is a real extruded solid, so it needs its actual silhouette as a
 * polygon — not just a mask. Marching squares over the signed distance field at
 * level `border` gives exactly that, and because it is a distance field the same
 * pass produces the outline at any border width for the same cost.
 *
 * The field is sampled on a coarse grid first. A distance field is smooth, so a
 * few hundred samples across carry the shape faithfully, and the front face is
 * trimmed per-pixel by the shader against the full-resolution field anyway — the
 * polygon only has to place the side walls.
 */

export interface Loop {
  /** Interleaved x,y in field coordinates. */
  points: number[]
  /** Signed area. Sign distinguishes an outer shell from a hole. */
  area: number
}

/** Bilinear sample of `field`, clamped at the edges. */
function sample(
  field: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const cx = Math.min(width - 1, Math.max(0, x))
  const cy = Math.min(height - 1, Math.max(0, y))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const fx = cx - x0
  const fy = cy - y0
  const a = field[y0 * width + x0]
  const b = field[y0 * width + x1]
  const c = field[y1 * width + x0]
  const d = field[y1 * width + x1]
  return (
    a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
  )
}

/** Where the segment between two corner values crosses `level`. */
function crossing(v0: number, v1: number, level: number): number {
  const span = v1 - v0
  if (Math.abs(span) < 1e-9) return 0.5
  return Math.min(1, Math.max(0, (level - v0) / span))
}

function signedArea(points: number[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length
    sum += points[i] * points[j + 1] - points[j] * points[i + 1]
  }
  return sum / 2
}

/**
 * Ramer–Douglas–Peucker. The traced outline has a vertex per grid crossing, far
 * more than an extrusion needs; dropping the ones that sit on a straight run
 * keeps the silhouette and cuts the triangle count by an order of magnitude.
 */
function simplify(points: number[], tolerance: number): number[] {
  const count = points.length / 2
  if (count < 5) return points

  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1

  const stack: [number, number][] = [[0, count - 1]]
  const tol2 = tolerance * tolerance

  while (stack.length) {
    const [first, last] = stack.pop()!
    if (last <= first + 1) continue

    const ax = points[first * 2]
    const ay = points[first * 2 + 1]
    const bx = points[last * 2]
    const by = points[last * 2 + 1]
    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy

    let worst = -1
    let worstIndex = first

    for (let i = first + 1; i < last; i++) {
      const px = points[i * 2]
      const py = points[i * 2 + 1]
      let d2: number
      if (lengthSq < 1e-12) {
        d2 = (px - ax) * (px - ax) + (py - ay) * (py - ay)
      } else {
        let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq
        t = Math.min(1, Math.max(0, t))
        const qx = ax + t * dx
        const qy = ay + t * dy
        d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy)
      }
      if (d2 > worst) {
        worst = d2
        worstIndex = i
      }
    }

    if (worst > tol2) {
      keep[worstIndex] = 1
      stack.push([first, worstIndex], [worstIndex, last])
    }
  }

  const out: number[] = []
  for (let i = 0; i < count; i++) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1])
  }
  return out
}

/**
 * Marching squares at `level`, returning closed loops in grid coordinates.
 *
 * Segments are emitted per cell and then stitched end to end. Stitching by
 * quantised endpoint is what lets a cell emit its two segments independently and
 * still recover one continuous outline — including the saddle cases, which are
 * resolved with the cell's centre value so adjacent cells always agree.
 */
export function marchingSquares(
  field: Float32Array,
  width: number,
  height: number,
  level: number,
): Loop[] {
  // Every segment endpoint is shared by exactly two cells, so a key at this
  // precision joins them without merging distinct crossings.
  const QUANT = 1e5
  const key = (x: number, y: number) =>
    `${Math.round(x * QUANT)},${Math.round(y * QUANT)}`

  /** Directed adjacency: the end of one segment is the start of the next. */
  const next = new Map<string, { x: number; y: number; key: string }>()

  const push = (x0: number, y0: number, x1: number, y1: number) => {
    const from = key(x0, y0)
    if (next.has(from)) return
    next.set(from, { x: x1, y: y1, key: key(x1, y1) })
  }

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = field[y * width + x]
      const b = field[y * width + x + 1]
      const c = field[(y + 1) * width + x + 1]
      const d = field[(y + 1) * width + x]

      // Inside is below the level: the field is negative within the artwork, so
      // `level = border` traces the die cut.
      const mask =
        (a < level ? 1 : 0) |
        (b < level ? 2 : 0) |
        (c < level ? 4 : 0) |
        (d < level ? 8 : 0)
      if (mask === 0 || mask === 15) continue

      const top = { x: x + crossing(a, b, level), y }
      const right = { x: x + 1, y: y + crossing(b, c, level) }
      const bottom = { x: x + crossing(d, c, level), y: y + 1 }
      const left = { x, y: y + crossing(a, d, level) }

      // Wound so the inside stays on the left of travel; that makes outer shells
      // and holes come out with opposite signed area.
      switch (mask) {
        case 1:
          push(left.x, left.y, top.x, top.y)
          break
        case 2:
          push(top.x, top.y, right.x, right.y)
          break
        case 3:
          push(left.x, left.y, right.x, right.y)
          break
        case 4:
          push(right.x, right.y, bottom.x, bottom.y)
          break
        case 6:
          push(top.x, top.y, bottom.x, bottom.y)
          break
        case 7:
          push(left.x, left.y, bottom.x, bottom.y)
          break
        case 8:
          push(bottom.x, bottom.y, left.x, left.y)
          break
        case 9:
          push(bottom.x, bottom.y, top.x, top.y)
          break
        case 11:
          push(bottom.x, bottom.y, right.x, right.y)
          break
        case 12:
          push(right.x, right.y, left.x, left.y)
          break
        case 13:
          push(right.x, right.y, top.x, top.y)
          break
        case 14:
          push(top.x, top.y, left.x, left.y)
          break
        case 5:
        case 10: {
          // Saddle: the centre decides which pair of corners is connected.
          const centre = (a + b + c + d) / 4
          const centreInside = centre < level
          if (mask === 5) {
            if (centreInside) {
              push(left.x, left.y, top.x, top.y)
              push(right.x, right.y, bottom.x, bottom.y)
            } else {
              push(left.x, left.y, bottom.x, bottom.y)
              push(right.x, right.y, top.x, top.y)
            }
          } else if (centreInside) {
            push(top.x, top.y, right.x, right.y)
            push(bottom.x, bottom.y, left.x, left.y)
          } else {
            push(top.x, top.y, left.x, left.y)
            push(bottom.x, bottom.y, right.x, right.y)
          }
          break
        }
      }
    }
  }

  const loops: Loop[] = []
  const visited = new Set<string>()

  for (const start of next.keys()) {
    if (visited.has(start)) continue

    const points: number[] = []
    let cursor = start
    // Bounded so a malformed adjacency can never spin.
    for (let guard = 0; guard <= next.size; guard++) {
      if (visited.has(cursor)) break
      visited.add(cursor)
      const step = next.get(cursor)
      if (!step) break
      points.push(step.x, step.y)
      cursor = step.key
    }

    if (points.length >= 8) {
      const simplified = simplify(points, 0.28)
      if (simplified.length >= 6) {
        loops.push({ points: simplified, area: signedArea(simplified) })
      }
    }
  }

  return loops
}

/** Even-odd containment test. */
export function containsPoint(points: number[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const xi = points[i]
    const yi = points[i + 1]
    const xj = points[j]
    const yj = points[j + 1]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export interface CoarseField {
  values: Float32Array
  width: number
  height: number
  /** Field pixels per coarse cell. */
  scale: number
}

/**
 * Resample the distance field onto a coarse grid. Distance fields are smooth, so
 * this loses nothing the side walls care about, and it turns a multi-megapixel
 * trace into a few tens of thousands of cells.
 */
export function coarsen(
  sdf: Float32Array,
  width: number,
  height: number,
  longEdge: number,
): CoarseField {
  const scale = Math.max(1, Math.max(width, height) / longEdge)
  const cw = Math.max(4, Math.round(width / scale))
  const ch = Math.max(4, Math.round(height / scale))
  const values = new Float32Array(cw * ch)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      values[y * cw + x] = sample(sdf, width, height, x * scale, y * scale)
    }
  }
  return { values, width: cw, height: ch, scale }
}
