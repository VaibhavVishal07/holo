import * as THREE from 'three'
import type { Artwork } from '../lib/artwork'
import { containsPoint, marchingSquares } from '../lib/contour'

/**
 * The sticker as a real extruded solid.
 *
 * The die-cut outline is traced out of the distance field and extruded, so the
 * object has genuine side walls that catch the light and a silhouette with actual
 * thickness when it turns. Depth is baked at one unit and applied by scaling z,
 * which keeps the Depth control free of geometry rebuilds — only a change of
 * border width needs a new trace.
 */

/**
 * Traced a hair outside the die cut. The shader trims the front face against the
 * full-resolution field, so the polygon only has to be sure it never falls short
 * of the true contour and clips the artwork.
 */
const OUTSET_PX = 1.2

export interface StickerGeometry {
  geometry: THREE.ExtrudeGeometry
  planeWidth: number
  planeHeight: number
}

export function buildStickerGeometry(
  artwork: Artwork,
  borderPx: number,
): StickerGeometry | null {
  const { coarse, width, height } = artwork
  const long = Math.max(width, height)
  const planeWidth = width / long
  const planeHeight = height / long

  const loops = marchingSquares(
    coarse.values,
    coarse.width,
    coarse.height,
    borderPx + OUTSET_PX,
  )
  if (!loops.length) return null

  // Coarse grid cell -> plane-local units, so the mesh sits where the old plane
  // did and the shader can recover mask UVs straight from position.
  const toLocalX = (gx: number) => ((gx * coarse.scale) / width - 0.5) * planeWidth
  const toLocalY = (gy: number) => (0.5 - (gy * coarse.scale) / height) * planeHeight

  // Winding puts the inside on the left, so shells and holes carry opposite
  // signed area. Whichever sign is the larger total is the shells.
  let positive = 0
  let negative = 0
  for (const loop of loops) {
    if (loop.area > 0) positive += loop.area
    else negative -= loop.area
  }
  const shellSign = positive >= negative ? 1 : -1

  const shells = loops.filter((l) => Math.sign(l.area) === shellSign)
  const holes = loops.filter((l) => Math.sign(l.area) !== shellSign)
  if (!shells.length) return null

  // Each hole belongs to the smallest shell that contains it, so nested forms
  // (a counter inside a letter inside a badge) resolve correctly.
  const shapes: THREE.Shape[] = shells.map((shell) => {
    const shape = new THREE.Shape()
    trace(shape, shell.points, toLocalX, toLocalY)
    return shape
  })

  for (const hole of holes) {
    const hx = hole.points[0]
    const hy = hole.points[1]
    let bestIndex = -1
    let bestArea = Infinity
    shells.forEach((shell, index) => {
      const area = Math.abs(shell.area)
      if (area < bestArea && containsPoint(shell.points, hx, hy)) {
        bestArea = area
        bestIndex = index
      }
    })
    if (bestIndex < 0) continue
    const path = new THREE.Path()
    trace(path, hole.points, toLocalX, toLocalY)
    shapes[bestIndex].holes.push(path)
  }

  // A cut vinyl edge is not a sharp corner. A shallow bevel gives the rim
  // something to catch the light with, which is what reads as thickness.
  const bevel = 0.0035
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: 1,
    bevelEnabled: true,
    bevelThickness: 0.16,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 1,
  })

  // Rotate about the middle of the sheet rather than its back face.
  geometry.translate(0, 0, -0.5)
  geometry.computeVertexNormals()

  return { geometry, planeWidth, planeHeight }
}

function trace(
  target: THREE.Shape | THREE.Path,
  points: number[],
  toLocalX: (x: number) => number,
  toLocalY: (y: number) => number,
) {
  target.moveTo(toLocalX(points[0]), toLocalY(points[1]))
  for (let i = 2; i < points.length; i += 2) {
    target.lineTo(toLocalX(points[i]), toLocalY(points[i + 1]))
  }
  target.closePath()
}

/** Depth slider to sheet thickness, in plane units. */
export function sheetThickness(depth: number): number {
  return 0.009 + depth * 0.042
}
