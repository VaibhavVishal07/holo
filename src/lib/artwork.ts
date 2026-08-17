import { DataUtils } from 'three'
import { signedDistanceField } from './edt'

/**
 * Everything downstream of an upload. One pass, done once per image: decode ->
 * alpha mask -> trim -> pad -> signed distance field. Nothing here runs during
 * interaction; pointer movement only ever touches uniforms.
 */

/** Longest edge of the working mask, before padding. */
const MASK_LONG_EDGE = 1400
/** Room around the artwork for the die-cut border and the shadow spread. */
const PAD = 120
/** Range the SDF is encoded over, in mask pixels. Caps the widest border. */
export const SDF_RANGE = 104
/** Upper bound on the die-cut border, in mask pixels. */
export const MAX_BORDER_PX = 52

export interface Artwork {
  /** Padded mask dimensions, in mask pixels. */
  width: number
  height: number
  /** Signed distance to the artwork contour, in mask pixels. Half-float, R. */
  sdf: Uint16Array
  /** RGB of the source artwork, A = mask. RGBA8. */
  color: Uint8Array
  /** Half the artwork's untrimmed extent, in mask pixels — used for framing. */
  contentWidth: number
  contentHeight: number
  /** True when the mask came from the file's own alpha channel. */
  fromAlpha: boolean
  label: string
}

export type MaskSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap

function ctx2d(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  return ctx
}

/**
 * Rasterise an SVG at a resolution suited to the mask, not to the viewport.
 * SVGs without intrinsic dimensions decode at 0x0 in some browsers and at 150px
 * in others, so we always restate width/height from the viewBox.
 */
async function rasterizeSvg(file: Blob): Promise<HTMLCanvasElement> {
  const source = await file.text()
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName !== 'svg') throw new Error('That SVG could not be read')

  let w = parseFloat(svg.getAttribute('width') ?? '')
  let h = parseFloat(svg.getAttribute('height') ?? '')
  const viewBox = (svg.getAttribute('viewBox') ?? '')
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n))

  if ((!w || !h) && viewBox.length === 4) {
    w = viewBox[2]
    h = viewBox[3]
  }
  if (!w || !h) {
    w = 512
    h = 512
  }
  if (viewBox.length !== 4) svg.setAttribute('viewBox', `0 0 ${w} ${h}`)

  const scale = (MASK_LONG_EDGE * 1.4) / Math.max(w, h)
  const outW = Math.max(1, Math.round(w * scale))
  const outH = Math.max(1, Math.round(h * scale))
  svg.setAttribute('width', String(outW))
  svg.setAttribute('height', String(outH))

  const serialized = new XMLSerializer().serializeToString(svg)
  const url = URL.createObjectURL(
    new Blob([serialized], { type: 'image/svg+xml' }),
  )
  try {
    const img = new Image()
    img.decoding = 'sync'
    img.src = url
    await img.decode()
    const ctx = ctx2d(outW, outH)
    ctx.drawImage(img, 0, 0, outW, outH)
    return ctx.canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function decode(file: Blob): Promise<MaskSource> {
  if (file.type === 'image/svg+xml') return rasterizeSvg(file)
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    // Copy into a canvas so the object URL can be released immediately.
    const ctx = ctx2d(img.naturalWidth, img.naturalHeight)
    ctx.drawImage(img, 0, 0)
    return ctx.canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Otsu's method over a 256-bin luminance histogram. */
function otsu(histogram: Float64Array, total: number): number {
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]

  let weightBelow = 0
  let sumBelow = 0
  let best = 0
  let bestVariance = -1

  for (let t = 0; t < 256; t++) {
    weightBelow += histogram[t]
    if (weightBelow === 0) continue
    const weightAbove = total - weightBelow
    if (weightAbove === 0) break
    sumBelow += t * histogram[t]
    const meanBelow = sumBelow / weightBelow
    const meanAbove = (sum - sumBelow) / weightAbove
    const variance =
      weightBelow * weightAbove * (meanBelow - meanAbove) * (meanBelow - meanAbove)
    if (variance > bestVariance) {
      bestVariance = variance
      best = t
    }
  }
  return best / 255
}

interface RawMask {
  alpha: Float32Array
  rgb: Uint8Array
  width: number
  height: number
  fromAlpha: boolean
}

/**
 * Turn source pixels into an alpha mask.
 *
 * Real transparency wins — it is already the artist's intent and its
 * anti-aliasing is better than anything we could infer. Otherwise we read
 * luminance: ink is the artwork, paper is transparent, with the paper side
 * decided by the border pixels so white-on-black art works without a toggle.
 */
function buildMask(source: MaskSource, invert: boolean): RawMask {
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height
  const scale = Math.min(1, MASK_LONG_EDGE / Math.max(w, h))
  const width = Math.max(1, Math.round(w * scale))
  const height = Math.max(1, Math.round(h * scale))

  const ctx = ctx2d(width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height)
  const data = ctx.getImageData(0, 0, width, height).data

  const count = width * height
  const alpha = new Float32Array(count)
  const rgb = new Uint8Array(count * 3)
  const luma = new Float32Array(count)

  let translucent = 0
  for (let i = 0; i < count; i++) {
    const p = i * 4
    const r = data[p]
    const g = data[p + 1]
    const b = data[p + 2]
    const a = data[p + 3]
    rgb[i * 3] = r
    rgb[i * 3 + 1] = g
    rgb[i * 3 + 2] = b
    luma[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    alpha[i] = a / 255
    if (a < 250) translucent++
  }

  const fromAlpha = translucent / count > 0.004

  if (fromAlpha) {
    if (invert) for (let i = 0; i < count; i++) alpha[i] = 1 - alpha[i]
    return { alpha, rgb, width, height, fromAlpha }
  }

  const histogram = new Float64Array(256)
  for (let i = 0; i < count; i++) histogram[Math.round(luma[i] * 255)]++
  const threshold = otsu(histogram, count)

  // Mean luminance of the outer ring tells us which side is paper.
  let edgeSum = 0
  let edgeCount = 0
  const ring = Math.max(1, Math.round(Math.min(width, height) * 0.02))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= ring && x < width - ring && y >= ring && y < height - ring) continue
      edgeSum += luma[y * width + x]
      edgeCount++
    }
  }
  const paperIsBright = edgeSum / edgeCount > threshold

  // A soft window around the threshold instead of a hard cut: keeps rendered
  // type and scanned linework from developing jagged, chewed edges.
  const half = 0.085
  const lo = Math.max(0.002, threshold - half)
  const hi = Math.min(0.998, threshold + half)

  for (let i = 0; i < count; i++) {
    const t = Math.min(1, Math.max(0, (luma[i] - lo) / (hi - lo)))
    const smooth = t * t * (3 - 2 * t)
    let a = paperIsBright ? 1 - smooth : smooth
    if (invert) a = 1 - a
    alpha[i] = a
  }

  return { alpha, rgb, width, height, fromAlpha }
}

/** Crop to the inked area, then resample to the working size and pad. */
function trimAndPad(mask: RawMask): Artwork {
  const { alpha, rgb, width, height } = mask

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > 0.02) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) {
    minX = 0
    minY = 0
    maxX = width - 1
    maxY = height - 1
  }

  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1
  const scale = Math.min(1, MASK_LONG_EDGE / Math.max(cropW, cropH))
  const contentWidth = Math.max(1, Math.round(cropW * scale))
  const contentHeight = Math.max(1, Math.round(cropH * scale))
  const outW = contentWidth + PAD * 2
  const outH = contentHeight + PAD * 2

  // Resample through the canvas so we inherit its filtering, carrying the mask
  // in the alpha channel and the source colour in RGB.
  const src = ctx2d(width, height)
  const srcData = src.createImageData(width, height)
  for (let i = 0; i < alpha.length; i++) {
    const p = i * 4
    srcData.data[p] = rgb[i * 3]
    srcData.data[p + 1] = rgb[i * 3 + 1]
    srcData.data[p + 2] = rgb[i * 3 + 2]
    srcData.data[p + 3] = Math.round(alpha[i] * 255)
  }
  src.putImageData(srcData, 0, 0)

  const out = ctx2d(outW, outH)
  out.imageSmoothingEnabled = true
  out.imageSmoothingQuality = 'high'
  out.drawImage(
    src.canvas,
    minX,
    minY,
    cropW,
    cropH,
    PAD,
    PAD,
    contentWidth,
    contentHeight,
  )
  const outData = out.getImageData(0, 0, outW, outH).data

  const outCount = outW * outH
  const finalAlpha = new Float32Array(outCount)
  const color = new Uint8Array(outCount * 4)
  for (let i = 0; i < outCount; i++) {
    const p = i * 4
    finalAlpha[i] = outData[p + 3] / 255
    color[p] = outData[p]
    color[p + 1] = outData[p + 1]
    color[p + 2] = outData[p + 2]
    color[p + 3] = outData[p + 3]
  }

  const sdfFloat = signedDistanceField(finalAlpha, outW, outH)
  const sdf = new Uint16Array(outCount)
  for (let i = 0; i < outCount; i++) {
    sdf[i] = DataUtils.toHalfFloat(
      Math.max(-SDF_RANGE, Math.min(SDF_RANGE, sdfFloat[i])),
    )
  }

  return {
    width: outW,
    height: outH,
    sdf,
    color,
    contentWidth,
    contentHeight,
    fromAlpha: mask.fromAlpha,
    label: '',
  }
}

export async function processFile(
  file: File,
  invert: boolean,
): Promise<Artwork> {
  const source = await decode(file)
  const artwork = trimAndPad(buildMask(source, invert))
  artwork.label = file.name
  return artwork
}

export function processSource(
  source: MaskSource,
  invert: boolean,
  label: string,
): Artwork {
  const artwork = trimAndPad(buildMask(source, invert))
  artwork.label = label
  return artwork
}

export const ACCEPTED_TYPES =
  'image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg'
