import { useCallback, useState } from 'react'
import * as THREE from 'three'
import { sceneHandle } from '../scene/handle'
import { exportFilename, saveFile } from '../lib/saveFile'
import { BORDER_UNIT_PX } from '../scene/materials'
import { backgroundById, useStore } from '../state/store'

/** Long edge of a 1x export. */
const BASE_LONG_EDGE = 1024
const MAX_LONG_EDGE = 4096

export function exportDimensions(
  scale: number,
  aspect: number,
): { width: number; height: number } {
  const long = Math.min(BASE_LONG_EDGE * scale, MAX_LONG_EDGE)
  return aspect >= 1
    ? { width: Math.round(long), height: Math.max(1, Math.round(long / aspect)) }
    : { width: Math.max(1, Math.round(long * aspect)), height: Math.round(long) }
}

/**
 * The aspect of the frame we would export right now. It changes as the sticker
 * turns, because the crop is fitted to the tilted silhouette.
 */
export function currentExportAspect(): number {
  const box = tightFrame()
  return box ? box.aspect : 1
}

export interface Frame {
  /** Sub-rectangle of the current canvas, in CSS pixels. */
  x: number
  y: number
  width: number
  height: number
  fullWidth: number
  fullHeight: number
  aspect: number
}

const corner = new THREE.Vector3()

/**
 * Fits the export crop to the sticker as it is right now.
 *
 * Rendering the whole viewport and trimming afterwards would either waste
 * resolution on empty canvas or need a second readback to find the edges. So we
 * project the eight corners that matter — the tilted sticker and, when it is
 * being included, its shadow — and hand the resulting rectangle to
 * `camera.setViewOffset`, which lets the renderer draw only that region at full
 * resolution.
 */
export function tightFrame(includeShadow = false): Frame | null {
  const handle = sceneHandle.current
  const state = useStore.getState()
  const artwork = state.artwork
  if (!handle || !artwork) return null

  const { camera, tilt, shadow, planeWidth, planeHeight } = handle

  // The interesting region in mask pixels: the artwork, grown by the die cut.
  const pad = (artwork.width - artwork.contentWidth) / 2
  const border =
    state.borderMaterial === 'none' ? 0 : state.border * BORDER_UNIT_PX
  const grow = border + 3

  const x0 = pad - grow
  const x1 = pad + artwork.contentWidth + grow
  const y0 = pad - grow
  const y1 = pad + artwork.contentHeight + grow

  const toLocal = (px: number, py: number): [number, number] => [
    (px / artwork.width - 0.5) * planeWidth,
    (0.5 - py / artwork.height) * planeHeight,
  ]

  const box = [toLocal(x0, y0), toLocal(x1, y0), toLocal(x1, y1), toLocal(x0, y1)]

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const project = (object: THREE.Object3D, spread: number) => {
    object.updateWorldMatrix(true, false)
    for (const [lx, ly] of box) {
      for (const sx of spread ? [-spread, spread] : [0]) {
        for (const sy of spread ? [-spread, spread] : [0]) {
          corner.set(lx + sx, ly + sy, 0).applyMatrix4(object.matrixWorld)
          corner.project(camera)
          minX = Math.min(minX, corner.x)
          maxX = Math.max(maxX, corner.x)
          minY = Math.min(minY, corner.y)
          maxY = Math.max(maxY, corner.y)
        }
      }
    }
  }

  project(tilt, 0)
  if (includeShadow) {
    const spreadPx = 12 + state.shadow * 30
    project(shadow, (spreadPx / artwork.width) * planeWidth)
  }

  const size = handle.gl.getSize(new THREE.Vector2())
  const fullWidth = size.x
  const fullHeight = size.y

  // A hair of margin so an anti-aliased edge is never clipped by the crop.
  const marginX = (maxX - minX) * 0.012
  const marginY = (maxY - minY) * 0.012
  minX -= marginX
  maxX += marginX
  minY -= marginY
  maxY += marginY

  const px = (ndc: number) => (ndc * 0.5 + 0.5) * fullWidth
  const py = (ndc: number) => (1 - (ndc * 0.5 + 0.5)) * fullHeight

  const left = px(minX)
  const right = px(maxX)
  const top = py(maxY)
  const bottom = py(minY)

  const width = Math.max(1, right - left)
  const height = Math.max(1, bottom - top)

  return {
    x: left,
    y: top,
    width,
    height,
    fullWidth,
    fullHeight,
    aspect: width / height,
  }
}

export function useExport() {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    const handle = sceneHandle.current
    const state = useStore.getState()
    if (!handle || !state.artwork || busy) return

    const { gl, scene, camera, shadow } = handle
    const { scale, transparent } = state.exportSettings
    const background = backgroundById(state.background)
    const opaque = !transparent && background.color !== null

    setBusy(true)
    setError(null)

    const frame = tightFrame(opaque)
    if (!frame) {
      setBusy(false)
      return
    }

    const { width: outWidth, height: outHeight } = exportDimensions(
      scale,
      frame.aspect,
    )

    const target = new THREE.WebGLRenderTarget(outWidth, outHeight, {
      samples: 4,
      type: THREE.UnsignedByteType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: true,
    })

    const previousTarget = gl.getRenderTarget()
    const previousClear = gl.getClearColor(new THREE.Color())
    const previousAlpha = gl.getClearAlpha()
    const previousBackground = scene.background
    const shadowWasVisible = shadow.visible

    try {
      // A transparent PNG carries the sticker, not the room it was sitting in.
      shadow.visible = opaque && shadowWasVisible

      camera.setViewOffset(
        frame.fullWidth,
        frame.fullHeight,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
      )

      gl.setRenderTarget(target)
      if (opaque && background.color) {
        gl.setClearColor(new THREE.Color(background.color), 1)
      } else {
        // A scene background is painted at alpha 1 whatever the clear alpha is,
        // so it has to come off entirely for a transparent export.
        scene.background = null
        gl.setClearColor(new THREE.Color('#000000'), 0)
      }
      gl.clear(true, true, true)
      gl.render(scene, camera)

      // Switching away is what resolves a multisampled target into the texture
      // that readRenderTargetPixels actually reads.
      gl.setRenderTarget(previousTarget)

      const pixels = new Uint8Array(outWidth * outHeight * 4)
      gl.readRenderTargetPixels(target, 0, 0, outWidth, outHeight, pixels)

      const blob = await encodePng(pixels, outWidth, outHeight)
      await saveFile(blob, exportFilename(state.artwork.label, 'png'))
      setDone(true)
      setTimeout(() => setDone(false), 1800)
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'Export failed')
    } finally {
      camera.clearViewOffset()
      gl.setRenderTarget(previousTarget)
      gl.setClearColor(previousClear, previousAlpha)
      scene.background = previousBackground
      shadow.visible = shadowWasVisible
      target.dispose()
      setBusy(false)
    }
  }, [busy])

  return { exportPng: run, busy, done, error }
}

/**
 * GL hands back a bottom-up buffer holding premultiplied colour, because that is
 * what alpha blending leaves in the framebuffer. PNG wants top-down and straight
 * alpha, so both are undone here — skipping the divide is what gives exported
 * stickers a dark halo along every edge.
 */
async function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
): Promise<Blob> {
  const out = new Uint8ClampedArray(width * height * 4)
  const stride = width * 4

  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * stride
    const dst = y * stride
    for (let i = 0; i < stride; i += 4) {
      const a = pixels[src + i + 3]
      if (a === 0) continue
      const inv = 255 / a
      out[dst + i] = pixels[src + i] * inv
      out[dst + i + 1] = pixels[src + i + 1] * inv
      out[dst + i + 2] = pixels[src + i + 2] * inv
      out[dst + i + 3] = a
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.putImageData(new ImageData(out, width, height), 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      'image/png',
    )
  })
}
