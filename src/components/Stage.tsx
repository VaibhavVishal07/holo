import { useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Sticker } from '../scene/Sticker'
import { Backdrop } from '../scene/Backdrop'
import { useTilt, usePrefersReducedMotion } from '../hooks/useTilt'
import { backgroundById, useStore } from '../state/store'

interface Props {
  onUpload: () => void
}

export function Stage({ onUpload }: Props) {
  const surface = useRef<HTMLDivElement>(null)
  const artwork = useStore((s) => s.artwork)
  const isDemo = useStore((s) => s.isDemo)
  const auto = useStore((s) => s.auto)
  const busy = useStore((s) => s.busy)
  const error = useStore((s) => s.error)
  const dismissError = useStore((s) => s.dismissError)
  const background = backgroundById(useStore((s) => s.background))
  const reduceMotion = usePrefersReducedMotion()

  const engine = useTilt(surface, { auto, reduceMotion })

  // A new artwork gets a new entry animation.
  const entryKey = useRef(0)
  const previous = useRef(artwork)
  if (previous.current !== artwork) {
    previous.current = artwork
    entryKey.current += 1
  }

  return (
    <div className="stage">
      {/* The canvas is its own flex row rather than a backdrop with copy floated
          over it, so on a short window the sticker gives up height instead of
          colliding with the text underneath. It is also the drag target, which
          keeps grab-to-rotate confined to the object's own space. */}
      <div className="stage-canvas" ref={surface}>
        <Canvas
          // Straight alpha out of the shader needs straight-alpha blending. The
          // canvas itself stays opaque, so nothing depends on how the browser
          // interprets the buffer.
          gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
          dpr={[1, 2]}
          camera={{ fov: 26, position: [0, 0, 7.4], near: 0.1, far: 60 }}
          flat
          onCreated={({ gl }) => {
            gl.setClearColor(new THREE.Color('#000000'), 0)
          }}
        >
          {background.color !== null ? (
            <color attach="background" args={[background.color]} />
          ) : (
            <Backdrop />
          )}
          {artwork && (
            <Sticker artwork={artwork} engine={engine} entryKey={entryKey.current} />
          )}
        </Canvas>
        {busy && <p className="busy">Processing</p>}
      </div>

      {isDemo && !busy && (
        <div className="stage-empty">
          <p className="stage-lede">Turn anything into a holographic sticker.</p>
          <button className="upload-button" onClick={onUpload}>
            Upload image
          </button>
          <p className="stage-hint">
            PNG, JPG or SVG · Black &amp; white works best · Processed locally
          </p>
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button className="action" data-quiet="true" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
