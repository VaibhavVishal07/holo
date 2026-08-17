interface Props {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  /** How the number reads next to the track. Defaults to a percentage. */
  format?: (value: number) => string
}

/**
 * Track, fill and knob are drawn by the wrapper so the control can carry a
 * visible value and a proper hit area; the native input sits over it at zero
 * opacity, which keeps keyboard stepping and assistive behaviour native rather
 * than reimplemented.
 */
export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
}: Props) {
  const fill = ((value - min) / (max - min)) * 100
  const display = format ? format(value) : String(Math.round(fill))

  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <span className="slider-track" style={{ ['--fill' as string]: fill }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          aria-valuetext={display}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="slider-fill" aria-hidden="true" />
        <span className="slider-knob" aria-hidden="true" />
      </span>
      <span className="slider-value" aria-hidden="true">
        {display}
      </span>
    </label>
  )
}
