import { MaterialRail } from './MaterialRail'
import { Slider } from './Slider'
import { BACKGROUNDS, useStore, type BorderMaterial } from '../state/store'

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
      <div className="dock-inner">
        <MaterialRail />

        <div className="slider-row">
          <Slider label="Holo" value={s.holo} onChange={(v) => set('holo', v)} />
          <Slider label="Shine" value={s.shine} onChange={(v) => set('shine', v)} />
          <Slider label="Texture" value={s.texture} onChange={(v) => set('texture', v)} />
        </div>

        <div className="border-row">
          <Slider
            label="Border"
            value={s.border}
            min={0}
            max={40}
            step={1}
            onChange={(v) => set('border', v)}
            format={(v) => `${v}`}
          />
          <div
            className="choices"
            role="radiogroup"
            aria-label="Border material"
            style={{ opacity: s.border === 0 ? 0.35 : 1 }}
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
        </div>

        <div className="utility-row">
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

          <div className="utility-actions">
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
            <button
              type="button"
              className="action"
              data-quiet={!s.advancedOpen}
              aria-expanded={s.advancedOpen}
              onClick={() => s.setAdvancedOpen(!s.advancedOpen)}
            >
              More
            </button>
          </div>
        </div>

        {s.advancedOpen && (
          <div className="advanced">
            <Slider
              label="Spectrum"
              value={s.spectrum}
              onChange={(v) => set('spectrum', v)}
            />
            <Slider label="Depth" value={s.depth} onChange={(v) => set('depth', v)} />
            <Slider label="Shadow" value={s.shadow} onChange={(v) => set('shadow', v)} />
            <button
              type="button"
              className="action"
              data-quiet={!s.invert}
              aria-pressed={s.invert}
              disabled={s.busy}
              onClick={() => void s.toggleInvert()}
            >
              Invert
            </button>
          </div>
        )}
      </div>
    </div>
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
