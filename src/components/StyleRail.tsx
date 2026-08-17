import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { STYLES, styleById, type HoloStyle } from '../materials/styles'
import { processSource } from '../lib/artwork'
import type { Artwork } from '../lib/artwork'
import {
  StyleBlend,
  createArtworkTextures,
  createHoloMaterial,
  type ArtworkTextures,
} from '../scene/materials'
import { useStore } from '../state/store'

/**
 * Style choices as physical discs.
 *
 * These are not colour dots approximating the film — each one is the production
 * shader running on a circle, lit by the same virtual studio, at its own fixed
 * angle. So a swatch shows what that film actually does, and the row shimmers
 * because the material shimmers.
 */

const SWATCH = 30
const GAP = 10

let discArtwork: Artwork | null = null

function getDiscArtwork(): Artwork {
  if (discArtwork) return discArtwork
  const size = 360
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is unavailable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2)
  ctx.fill()
  discArtwork = processSource(canvas, false, 'disc')
  return discArtwork
}

export function StyleRail() {
  const active = useStore((s) => s.style)
  const setStyle = useStore((s) => s.set)
  const width = STYLES.length * SWATCH + (STYLES.length - 1) * GAP

  return (
    <div className="rail">
      <span className="micro">Style</span>
      <div
        className="rail-swatches"
        role="radiogroup"
        aria-label="Style"
        style={{ gap: `${GAP}px` }}
      >
        <div className="rail-canvas" aria-hidden="true">
          <Canvas
            orthographic
            flat
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
            camera={{ position: [0, 0, 10], zoom: 1 }}
            style={{ width, height: SWATCH }}
          >
            <Discs />
          </Canvas>
        </div>
        {STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={style.id === active}
            aria-label={style.name}
            className="swatch"
            style={{ width: SWATCH, height: SWATCH }}
            onClick={() => setStyle('style', style.id)}
          />
        ))}
      </div>
      <span className="rail-name">{styleById(active).name}</span>
    </div>
  )
}

function Discs() {
  const artwork = useMemo(() => getDiscArtwork(), [])
  const textures = useMemo(() => createArtworkTextures(artwork), [artwork])
  const scale = SWATCH / (artwork.contentWidth / Math.max(artwork.width, artwork.height))

  return (
    <>
      {STYLES.map((holoStyle, index) => (
        <Disc
          key={holoStyle.id}
          holoStyle={holoStyle}
          textures={textures}
          index={index}
          planeSize={scale}
        />
      ))}
    </>
  )
}

interface DiscProps {
  holoStyle: HoloStyle
  textures: ArtworkTextures
  index: number
  planeSize: number
}

function Disc({ holoStyle, textures, index, planeSize }: DiscProps) {
  const mesh = useRef<THREE.Mesh>(null)
  const material = useMemo(() => createHoloMaterial(textures), [textures])
  const blend = useMemo(() => new StyleBlend(holoStyle), [holoStyle])
  const light = useMemo(() => new THREE.Vector3(), [])
  const centre = (index - (STYLES.length - 1) / 2) * (SWATCH + GAP)

  useEffect(() => () => material.dispose(), [material])

  useFrame(({ clock, camera }, delta) => {
    blend.step(delta)
    const t = clock.elapsedTime * 0.45 + index * 1.7

    // Each disc sits at its own angle and drifts, so the row reads as seven
    // pieces of foil catching the light rather than seven flat icons.
    if (mesh.current) {
      mesh.current.rotation.x = Math.sin(t * 0.62) * 0.3 - 0.06
      mesh.current.rotation.y = Math.sin(t * 0.41 + 1.2) * 0.36
    }

    const u = material.uniforms
    light.set(0.5 + Math.sin(t * 0.3) * 0.35, 0.8, 2.4)
    u.uLight.value.copy(light)
    u.uCamera.value.copy(camera.position)
    u.uBorderMode.value = 0
    u.uBorderPx.value = 0
    // A plane, so the mask has to supply the silhouette.
    u.uTrim.value = 1
    u.uPlaneSize.value.set(planeSize, planeSize)
    u.uBase.value.copy(blend.base)
    u.uEnvLow.value.copy(blend.envLow)
    u.uEnvHigh.value.copy(blend.envHigh)
    u.uSpectralBias.value.copy(blend.bias)
    u.uKey.value = blend.get('key')
    u.uFill.value = blend.get('fill')
    u.uHolo.value = 0.58 * blend.get('holoScale')
    u.uShine.value = 0.55 * blend.get('shineScale')
    u.uTexture.value = 0.4
    u.uSaturation.value = blend.get('saturation')
    u.uPearl.value = blend.get('pearl')
    u.uGlass.value = blend.get('glass')
    u.uDispersion.value = blend.get('dispersion')
    u.uSparkle.value = blend.get('sparkle')
    u.uPeriod.value = blend.get('period')
    u.uPeriodVar.value = blend.get('periodVar')
    // A 27px disc can only carry one sweep before the bands turn into noise.
    u.uFlow.value = blend.get('flow') * 0.42
    u.uSwirl.value = blend.get('swirl')
    u.uCoverage.value = blend.get('coverage') * 1.15
    u.uRoughness.value = blend.get('roughness')
    u.uAniso.value = blend.get('aniso')
    u.uFacet.value = blend.get('facet')
    u.uDepth.value = 0.2
    u.uLambdaShift.value = blend.get('lambdaShift')
  })

  return (
    <mesh ref={mesh} material={material} position={[centre, 0, 0]}>
      <planeGeometry args={[planeSize, planeSize]} />
    </mesh>
  )
}
