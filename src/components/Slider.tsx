interface Props {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  /** Announced to assistive tech, since the numeric value is not shown. */
  format?: (value: number) => string
}

export function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
}: Props) {
  const percent = Math.round(((value - min) / (max - min)) * 100)
  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format ? format(value) : `${percent}%`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
