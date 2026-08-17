import { useEffect, useRef, useState } from 'react'
import { currentExportAspect, exportDimensions, useExport } from '../hooks/useExport'
import {
  MOTION_PRESETS,
  useMotionExport,
  type MotionPreset,
} from '../hooks/useMotionExport'
import { backgroundById, useStore } from '../state/store'

const SCALES: (1 | 2 | 4)[] = [1, 2, 4]

export function ExportPanel() {
  const [open, setOpen] = useState(false)
  const [motion, setMotion] = useState(false)
  const [motionPreset, setMotionPreset] = useState<MotionPreset>('showcase')
  const anchor = useRef<HTMLDivElement>(null)

  const settings = useStore((s) => s.exportSettings)
  const setExport = useStore((s) => s.setExport)
  const label = useStore((s) => s.artwork?.label ?? 'holo')
  const background = backgroundById(useStore((s) => s.background))

  const still = useExport()
  const clip = useMotionExport()
  const busy = still.busy || clip.recording

  // The crop follows the tilt, so the dimensions are measured when the panel
  // opens rather than assumed.
  const [aspect, setAspect] = useState(1)
  useEffect(() => {
    if (open) setAspect(currentExportAspect())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const size = exportDimensions(settings.scale, aspect)
  const transparentOnly = background.color === null

  return (
    <div className="export-anchor" ref={anchor}>
      <button
        type="button"
        className="action"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {still.done ? 'Exported' : 'Export'}
      </button>

      {open && (
        <div className="popover" role="dialog" aria-label="Export">
          <div className="popover-row">
            <div className="choices" role="radiogroup" aria-label="Kind">
              <button
                type="button"
                role="radio"
                className="choice"
                aria-checked={!motion}
                onClick={() => setMotion(false)}
              >
                Still
              </button>
              <button
                type="button"
                role="radio"
                className="choice"
                aria-checked={motion}
                onClick={() => setMotion(true)}
              >
                Motion
              </button>
            </div>
          </div>

          {motion ? (
            <>
              <div className="popover-stack" role="radiogroup" aria-label="Movement">
                {MOTION_PRESETS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    className="choice choice-block"
                    aria-checked={option.id === motionPreset}
                    onClick={() => setMotionPreset(option.id)}
                  >
                    <span>{option.name}</span>
                    <span className="choice-hint">{option.hint}</span>
                  </button>
                ))}
              </div>

              <p className="popover-summary">
                {clip.error ?? 'WebM · 3 seconds · loops'}
              </p>

              <button
                type="button"
                className="popover-submit"
                disabled={busy}
                onClick={() => void clip.record(motionPreset, label)}
              >
                {clip.recording
                  ? `Recording ${Math.round(clip.progress * 100)}%`
                  : 'Export motion'}
              </button>
            </>
          ) : (
            <>
              <div className="popover-row">
                <span className="popover-label">Resolution</span>
                <div className="choices" role="radiogroup" aria-label="Resolution">
                  {SCALES.map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      role="radio"
                      className="choice"
                      aria-checked={settings.scale === scale}
                      onClick={() => setExport({ scale })}
                    >
                      {scale}×
                    </button>
                  ))}
                </div>
              </div>

              <div className="popover-row">
                <span className="popover-label">Background</span>
                <div className="choices" role="radiogroup" aria-label="Background">
                  <button
                    type="button"
                    role="radio"
                    className="choice"
                    aria-checked={settings.transparent}
                    onClick={() => setExport({ transparent: true })}
                  >
                    Transparent
                  </button>
                  <button
                    type="button"
                    role="radio"
                    className="choice"
                    aria-checked={!settings.transparent}
                    disabled={transparentOnly}
                    onClick={() => setExport({ transparent: false })}
                  >
                    Current
                  </button>
                </div>
              </div>

              <p className="popover-summary">
                {still.error ?? `PNG · ${size.width} × ${size.height} · current tilt`}
              </p>

              <button
                type="button"
                className="popover-submit"
                disabled={busy}
                onClick={() => void still.exportPng()}
              >
                {still.busy ? 'Rendering' : 'Export PNG'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
