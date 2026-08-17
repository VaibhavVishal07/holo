import { useState } from 'react'
import { Slider } from './Slider'
import { LightPad } from './LightPad'
import { deviceTiltSupported, requestDeviceTilt } from '../hooks/useDeviceTilt'
import {
  BACKGROUNDS,
  useStore,
  type BorderMaterial,
  type DockTab,
} from '../state/store'

/**
 * One instrument, not a stack of unrelated rows.
 *
 * Controls are grouped by what they act on and shown one group at a time, which
 * is what keeps the panel from reading as a form. The body holds a fixed height
 * so switching groups never makes the panel jump.
 */

const TABS: { id: DockTab; name: string }[] = [
  { id: 'film', name: 'Film' },
  { id: 'light', name: 'Light' },
  { id: 'cut', name: 'Cut' },
  { id: 'canvas', name: 'Canvas' },
]

const BORDER_MATERIALS: { id: BorderMaterial; name: string }[] = [
  { id: 'none', name: 'None' },
  { id: 'white', name: 'White' },
  { id: 'silver', name: 'Silver' },
  { id: 'holo', name: 'Holo' },
]

export function Dock() {
  const s = useStore()
  const set = s.set

  return (
    <div className="dock">
      <div className="dock-panel">
        <div className="dock-row tab-bar">
          <div className="tabs" role="tablist" aria-label="Controls">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                className="tab"
                aria-selected={s.tab === tab.id}
                onClick={() => s.setTab(tab.id)}
              >
                {tab.name}
              </button>
            ))}
          </div>
          <div className="utility-actions">
            <button
              type="button"
              className="action"
              title="Re-roll the film, the colour and the light"
              onClick={s.shuffle}
            >
              Shuffle
            </button>
            <TiltButton />
            <button
              type="button"
              className="action"
              data-quiet={!s.auto}
              aria-pressed={s.auto}
              onClick={() => set('auto', !s.auto)}
            >
              Auto
            </button>
            <OriginalButton />
          </div>
        </div>

        <div className="dock-row dock-body" role="tabpanel">
          {s.tab === 'film' && (
            <div className="slider-grid">
              <Slider
                label="Hue"
                value={s.hue}
                spectrum
                format={(v) => `${Math.round(v * 360)}°`}
                onChange={(v) => set('hue', v)}
              />
              <Slider label="Holo" value={s.holo} onChange={(v) => set('holo', v)} />
              <Slider label="Shine" value={s.shine} onChange={(v) => set('shine', v)} />
              <Slider label="Glass" value={s.glass} onChange={(v) => set('glass', v)} />
            </div>
          )}

          {s.tab === 'light' && (
            <div className="light-row">
              <LightPad />
              <div className="light-controls">
                <Slider
                  label="Angle"
                  value={s.lightAngle}
                  onChange={(v) => set('lightAngle', v)}
                />
                <div className="light-follow">
                  <button
                    type="button"
                    className="action"
                    data-quiet={!s.lightFollow}
                    aria-pressed={s.lightFollow}
                    onClick={() => set('lightFollow', !s.lightFollow)}
                  >
                    Follow pointer
                  </button>
                </div>
              </div>
            </div>
          )}

          {s.tab === 'cut' && (
            <div className="cut-group">
              <div className="slider-grid">
                <Slider
                  label="Border"
                  value={s.border}
                  min={0}
                  max={40}
                  step={1}
                  onChange={(v) => set('border', v)}
                  format={(v) => String(v)}
                />
                <Slider label="Depth" value={s.depth} onChange={(v) => set('depth', v)} />
              </div>
              <div className="border-line">
                <div
                  className="choices"
                  role="radiogroup"
                  aria-label="Border material"
                  style={{ opacity: s.border === 0 ? 0.4 : 1 }}
                >
                  {BORDER_MATERIALS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      className="choice"
                      aria-checked={option.id === s.borderMaterial}
                      onClick={() => set('borderMaterial', option.id)}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="action"
                  data-quiet={!s.invert}
                  aria-pressed={s.invert}
                  disabled={s.busy}
                  onClick={() => void s.toggleInvert()}
                >
                  Invert mask
                </button>
              </div>
            </div>
          )}

          {s.tab === 'canvas' && (
            <div className="cut-group">
              <div className="slider-grid">
                <Slider
                  label="Shadow"
                  value={s.shadow}
                  onChange={(v) => set('shadow', v)}
                />
              </div>
              <div className="backgrounds" role="radiogroup" aria-label="Background">
                {BACKGROUNDS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    className="bg-swatch tip"
                    aria-checked={option.id === s.background}
                    aria-label={option.name}
                    data-tip={option.name}
                    data-transparent={option.color === null}
                    style={option.color ? { background: option.color } : undefined}
                    onClick={() => set('background', option.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Hands the object over to the phone's own tilt. Absent entirely on anything that
 * cannot report its attitude, rather than present and inert.
 */
function TiltButton() {
  const [supported] = useState(deviceTiltSupported)
  const on = useStore((s) => s.deviceTilt)
  const setDeviceTilt = useStore((s) => s.setDeviceTilt)

  if (!supported) return null

  return (
    <button
      type="button"
      className="action"
      data-quiet={!on}
      aria-pressed={on}
      onClick={() => {
        if (on) {
          setDeviceTilt(false)
          return
        }
        // The permission prompt has to be asked for from inside this gesture.
        void requestDeviceTilt().then((granted) => setDeviceTilt(granted))
      }}
    >
      Tilt
    </button>
  )
}

/** Hold to see the upload as it came in. */
function OriginalButton() {
  const setShowOriginal = useStore((s) => s.setShowOriginal)
  const showOriginal = useStore((s) => s.showOriginal)

  return (
    <button
      type="button"
      className="action"
      data-quiet={!showOriginal}
      aria-pressed={showOriginal}
      onPointerDown={() => setShowOriginal(true)}
      onPointerUp={() => setShowOriginal(false)}
      onPointerLeave={() => setShowOriginal(false)}
      onPointerCancel={() => setShowOriginal(false)}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') setShowOriginal(true)
      }}
      onKeyUp={() => setShowOriginal(false)}
      onBlur={() => setShowOriginal(false)}
    >
      Original
    </button>
  )
}
