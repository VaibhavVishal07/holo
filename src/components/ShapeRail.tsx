import { SHAPES, SHAPE_VIEWBOX } from '../lib/shapes'
import { useStore } from '../state/store'

/**
 * The shapes that come with the tool.
 *
 * Each swatch is the same path string that cuts the mask, so what you pick is
 * exactly what you get. Nothing is selected while an upload is on the canvas —
 * choosing a shape then replaces it, which is the only sensible reading of the
 * gesture.
 */
export function ShapeRail() {
  const shape = useStore((s) => s.shape)
  const isDemo = useStore((s) => s.isDemo)
  const loadShape = useStore((s) => s.loadShape)

  return (
    <div className="rail">
      <span className="micro">Shape</span>
      <div className="rail-shapes" role="radiogroup" aria-label="Shape">
        {SHAPES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            className="shape-swatch"
            aria-checked={isDemo && option.id === shape}
            aria-label={option.name}
            onClick={() => loadShape(option.id)}
          >
            <svg viewBox={`0 0 ${SHAPE_VIEWBOX} ${SHAPE_VIEWBOX}`} aria-hidden="true">
              <path
                d={option.path}
                fill="currentColor"
                fillRule={option.evenOdd ? 'evenodd' : 'nonzero'}
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
