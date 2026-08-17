/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher, 2012).
 *
 * We use it to build a signed distance field from the artwork mask. The SDF is
 * what makes the die-cut border possible: dilating a distance field follows the
 * shape's real contour, keeps curves smooth, survives concave forms and thin
 * typography, and lets `borderWidth` be a free shader uniform instead of a
 * re-processed bitmap.
 */

const INF = 1e20

/** In-place 1D squared distance transform over `f[0..n)`, result into `d`. */
function edt1d(
  f: Float64Array,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
  n: number,
) {
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  let k = 0

  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }

  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const dq = q - v[k]
    d[q] = dq * dq + f[v[k]]
  }
}

/**
 * Squared Euclidean distance from every cell to the nearest cell where
 * `seed[i]` is truthy. Returns squared distances in pixels.
 */
export function edt2d(
  seed: Uint8Array,
  width: number,
  height: number,
): Float64Array {
  const grid = new Float64Array(width * height)
  for (let i = 0; i < grid.length; i++) grid[i] = seed[i] ? 0 : INF

  const maxDim = Math.max(width, height)
  const f = new Float64Array(maxDim)
  const d = new Float64Array(maxDim)
  const v = new Int32Array(maxDim)
  const z = new Float64Array(maxDim + 1)

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) f[x] = grid[row + x]
    edt1d(f, d, v, z, width)
    for (let x = 0; x < width; x++) grid[row + x] = d[x]
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x]
    edt1d(f, d, v, z, height)
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y]
  }

  return grid
}

/**
 * Signed distance field in pixels from an anti-aliased alpha mask.
 *
 * Positive outside the shape, negative inside, zero on the 0.5 iso-contour.
 *
 * The integer EDT alone quantises to half a pixel, which shows up as stair
 * stepping along a die-cut edge. So within ~1.5px of the contour we replace it
 * with the analytic estimate `(0.5 - alpha) / |grad alpha|`, which reads the
 * sub-pixel position of the iso-line straight out of the anti-aliasing, and
 * cross-fade to the EDT further out.
 */
export function signedDistanceField(
  alpha: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const inside = new Uint8Array(width * height)
  const outside = new Uint8Array(width * height)
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] >= 0.5) inside[i] = 1
    else outside[i] = 1
  }

  const distToInside = edt2d(inside, width, height)
  const distToOutside = edt2d(outside, width, height)

  const sdf = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      // Distance to the contour: for an outside cell that is the distance to
      // the nearest inside cell, and vice versa. Subtract half a pixel so the
      // zero crossing lands between the two cells rather than on one of them.
      const raw =
        inside[i] === 1
          ? -(Math.sqrt(distToOutside[i]) - 0.5)
          : Math.sqrt(distToInside[i]) - 0.5

      const a = alpha[i]
      if (a > 0.002 && a < 0.998) {
        const xm = x > 0 ? i - 1 : i
        const xp = x < width - 1 ? i + 1 : i
        const ym = y > 0 ? i - width : i
        const yp = y < height - 1 ? i + width : i
        const gx = (alpha[xp] - alpha[xm]) / (xp - xm)
        const gy = ((alpha[yp] - alpha[ym]) * width) / (yp - ym)
        const g = Math.hypot(gx, gy)
        if (g > 1e-4) {
          const analytic = (0.5 - a) / g
          if (Math.abs(analytic) < 2.5) {
            // Trust the analytic estimate at the contour, the EDT away from it.
            const t = Math.min(1, Math.abs(raw) / 1.5)
            sdf[i] = analytic * (1 - t) + raw * t
            continue
          }
        }
      }
      sdf[i] = raw
    }
  }

  return smooth(sdf, width, height)
}

/**
 * A whisper of blur over the finished field.
 *
 * An exact discrete EDT measures to the nearest pixel centre, so its iso-contours
 * a few pixels out from the shape are faintly polygonal — which the die-cut
 * border reads back as a stepped edge, most visibly around the counters of
 * letterforms. A distance field is locally near-linear, so a one-pixel blur
 * leaves the zero crossing where it was and removes the ripple.
 */
function smooth(field: Float32Array, width: number, height: number): Float32Array {
  const kernel = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136]
  const pass = new Float32Array(field.length)
  const out = new Float32Array(field.length)

  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -2; k <= 2; k++) {
        const sx = Math.min(width - 1, Math.max(0, x + k))
        sum += field[row + sx] * kernel[k + 2]
      }
      pass[row + x] = sum
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0
      for (let k = -2; k <= 2; k++) {
        const sy = Math.min(height - 1, Math.max(0, y + k))
        sum += pass[sy * width + x] * kernel[k + 2]
      }
      out[y * width + x] = sum
    }
  }

  return out
}
