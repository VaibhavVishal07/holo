import { useCallback, useRef, useState } from 'react'
import { addAfterEffect } from '@react-three/fiber'
import { motionHandle } from '../scene/handle'
import { tightFrame } from './useExport'

/**
 * Three seconds of the material moving, recorded straight off the live canvas.
 *
 * The recording is driven by an override the render loop reads each frame, so the
 * shader, the spring and the lighting are exactly the ones on screen — nothing is
 * re-simulated for the export. Every preset is built from whole cycles of a single
 * period, which is what makes the clip loop without a visible cut.
 */

export type MotionPreset = 'subtle' | 'sweep' | 'tilt' | 'showcase'

export interface MotionOption {
  id: MotionPreset
  name: string
  hint: string
}

export const MOTION_PRESETS: MotionOption[] = [
  { id: 'subtle', name: 'Subtle', hint: 'Small natural drift' },
  { id: 'sweep', name: 'Sweep', hint: 'Only the light moves' },
  { id: 'tilt', name: 'Tilt', hint: 'Fuller physical turn' },
  { id: 'showcase', name: 'Showcase', hint: 'Tilt and light' },
]

const DURATION = 3
const FPS = 60
/** Milliseconds the closing pose is held so the encoder definitely records it. */
const CLOSE_HOLD = 180
/** Long edge of the recorded clip, in pixels. */
const LONG_EDGE = 960
const DEG = Math.PI / 180

export interface MotionPose {
  rotX: number
  rotY: number
  lightX: number
  lightY: number
}

/**
 * Pose at phase `p` in 0..1. Every term completes a whole number of cycles over
 * the phase, so the last frame joins the first exactly.
 */
export function motionPose(preset: MotionPreset, p: number): MotionPose {
  const a = p * Math.PI * 2

  switch (preset) {
    case 'sweep':
      return {
        rotX: Math.sin(a) * 1.1 * DEG,
        rotY: Math.sin(a * 2 + 0.6) * 1.4 * DEG,
        lightX: 0.34 + Math.sin(a) * 0.92,
        lightY: 0.66 + Math.sin(a * 2) * 0.24,
      }
    case 'tilt':
      return {
        rotX: Math.sin(a) * 7.5 * DEG,
        rotY: Math.cos(a) * 11 * DEG,
        lightX: 0.34 + Math.sin(a) * 0.2,
        lightY: 0.66 + Math.cos(a) * 0.12,
      }
    case 'showcase':
      return {
        rotX: Math.sin(a) * 4.5 * DEG + Math.sin(a * 2) * 1.2 * DEG,
        rotY: Math.cos(a) * 7 * DEG,
        lightX: 0.34 + Math.sin(a * 2 + 1.1) * 0.72,
        lightY: 0.66 + Math.cos(a) * 0.28,
      }
    case 'subtle':
    default:
      return {
        rotX: Math.sin(a) * 2.2 * DEG + Math.sin(a * 2 + 0.9) * 0.7 * DEG,
        rotY: Math.cos(a) * 3.4 * DEG,
        lightX: 0.34 + Math.sin(a) * 0.34,
        lightY: 0.66 + Math.cos(a * 2) * 0.14,
      }
  }
}

function pickMimeType(): string | null {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ]
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

export function useMotionExport() {
  const [recording, setRecording] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(false)

  const record = useCallback(
    async (preset: MotionPreset, label: string) => {
      const handle = motionHandle.current
      if (!handle || active.current) return
      if (typeof MediaRecorder === 'undefined') {
        setError('This browser cannot record video')
        return
      }
      const mimeType = pickMimeType()
      if (!mimeType) {
        setError('This browser cannot record video')
        return
      }

      // Crop tight to the sticker, generously grown so the widest pose of the
      // widest preset still fits. A clip that is mostly empty canvas is not much
      // use on a product page.
      const frame = tightFrame(true)
      if (!frame) {
        active.current = false
        setError('Nothing to record yet')
        return
      }

      const dpr = handle.canvas.width / frame.fullWidth
      const grow = 1.3
      const cropW = Math.min(frame.fullWidth, frame.width * grow)
      const cropH = Math.min(frame.fullHeight, frame.height * grow)
      const cropX = clamp(
        frame.x - (cropW - frame.width) / 2,
        0,
        frame.fullWidth - cropW,
      )
      const cropY = clamp(
        frame.y - (cropH - frame.height) / 2,
        0,
        frame.fullHeight - cropH,
      )

      // Even dimensions: video encoders want them, and odd ones get silently
      // rounded somewhere less predictable.
      const long = Math.min(LONG_EDGE, Math.max(cropW, cropH) * dpr)
      const scale = long / Math.max(cropW, cropH)
      const outW = even(cropW * scale)
      const outH = even(cropH * scale)

      const surface = document.createElement('canvas')
      surface.width = outW
      surface.height = outH
      const ctx = surface.getContext('2d', { alpha: false })
      if (!ctx) {
        active.current = false
        setError('Canvas 2D is unavailable')
        return
      }

      active.current = true
      setRecording(true)
      setProgress(0)
      setError(null)

      const stream = surface.captureStream(FPS)
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 12_000_000,
      })
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }

      const finished = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
      })

      recorder.start()

      // The crop has to be copied immediately after the render, while the drawing
      // buffer still holds this frame. Reading it at the top of the next frame
      // gets whatever the compositor left behind — in practice, nothing.
      const untap = addAfterEffect(() => {
        ctx.drawImage(
          handle.canvas,
          cropX * dpr,
          cropY * dpr,
          cropW * dpr,
          cropH * dpr,
          0,
          0,
          outW,
          outH,
        )
      })


      // Both the tap and the clock are armed only once the recorder is live, so
      // the first captured frame is phase zero and the last is one frame short of
      // a full cycle. Arming them earlier leaves the media shorter than the cycle
      // it animated, and that gap is exactly what a seam in the loop looks like.
      let begun: number | null = null
      let closeAt: number | null = null
      let complete = false
      handle.override = (now) => {
        if (begun === null) begun = now
        const phase = (now - begun) / 1000 / DURATION
        setProgressThrottled(setProgress, Math.min(1, phase))

        // The encoder does not reliably receive the last handful of frames before
        // a stop, which leaves the clip a few frames short of the cycle it
        // animated — and those missing frames are the seam. So once the cycle is
        // complete the closing pose is held briefly. It is identical to the
        // opening pose, so the join becomes exact by construction, and identical
        // frames cost almost nothing to encode.
        if (phase >= 1) {
          if (closeAt === null) closeAt = now + CLOSE_HOLD
          if (now >= closeAt && !complete) {
            complete = true
            recorder.stop()
          }
        }

        return motionPose(preset, Math.min(phase, 1) % 1)
      }

      // Safety net in case the render loop stalls and never reports completion.
      const guard = setTimeout(() => {
        if (!complete) {
          complete = true
          recorder.stop()
        }
      }, (DURATION + 3) * 1000)

      await finished
      clearTimeout(guard)

      handle.override = null
      untap()
      stream.getTracks().forEach((track) => track.stop())

      const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunks, { type: mimeType })
      const stem = label.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9-_]+/gi, '-')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${stem || 'holo'}-holo.${extension}`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      active.current = false
      setRecording(false)
      setProgress(0)
    },
    [],
  )

  return { record, recording, progress, error, dismissError: () => setError(null) }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

function even(v: number) {
  return Math.max(2, Math.round(v / 2) * 2)
}

let lastReport = 0
function setProgressThrottled(set: (v: number) => void, value: number) {
  const now = performance.now()
  if (value >= 1 || now - lastReport > 120) {
    lastReport = now
    set(value)
  }
}
