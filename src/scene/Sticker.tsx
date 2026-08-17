import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Artwork } from '../lib/artwork'
import { presetById } from '../materials/presets'
import type { TiltEngine } from '../hooks/useTilt'
import { useStore } from '../state/store'
import {
  BORDER_MODE,
  BORDER_UNIT_PX,
  MaterialBlend,
  createArtworkTextures,
  createEdgeMaterial,
  createHoloMaterial,
  createShadowMaterial,
} from './materials'
import { sceneHandle } from './handle'

/** Fraction of the shorter viewport axis the artwork should occupy. */
const FILL = 0.62

interface Props {
  artwork: Artwork
  engine: TiltEngine
  /** Set while the artwork has just changed, for the fade-in. */
  entryKey: number
}

export function Sticker({ artwork, engine, entryKey }: Props) {
  const root = useRef<THREE.Group>(null)
  const tilt = useRef<THREE.Group>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const surface = useRef<THREE.Mesh>(null)
  const edge = useRef<THREE.Mesh>(null)

  const { camera, gl, scene, viewport } = useThree()

  const textures = useMemo(() => createArtworkTextures(artwork), [artwork])
  const holoMaterial = useMemo(() => createHoloMaterial(textures), [textures])
  const edgeMaterial = useMemo(() => createEdgeMaterial(textures), [textures])
  const shadowMaterial = useMemo(() => createShadowMaterial(textures), [textures])

  useEffect(
    () => () => {
      holoMaterial.dispose()
      edgeMaterial.dispose()
      shadowMaterial.dispose()
      textures.dispose()
    },
    [holoMaterial, edgeMaterial, shadowMaterial, textures],
  )

  const blend = useMemo(
    () => new MaterialBlend(presetById(useStore.getState().material)),
    [],
  )

  // Plane geometry carries the padded mask's aspect; the padding is where the
  // die cut and the shadow live.
  const long = Math.max(artwork.width, artwork.height)
  const planeWidth = artwork.width / long
  const planeHeight = artwork.height / long

  // Scale so the artwork itself — not the padding — fills the frame.
  const fit = useMemo(() => {
    const contentW = artwork.contentWidth / long
    const contentH = artwork.contentHeight / long
    return FILL / Math.max(contentW / viewport.width, contentH / viewport.height)
  }, [artwork.contentWidth, artwork.contentHeight, long, viewport.width, viewport.height])

  useLayoutEffect(() => {
    if (!root.current || !tilt.current || !shadow.current) return
    sceneHandle.current = {
      gl,
      scene,
      camera: camera as THREE.PerspectiveCamera,
      tilt: tilt.current,
      root: root.current,
      shadow: shadow.current,
      planeWidth,
      planeHeight,
    }
    return () => {
      sceneHandle.current = null
    }
  }, [gl, scene, camera, planeWidth, planeHeight])

  // Fade the new material in rather than cutting to it.
  const entry = useRef(0)
  useEffect(() => {
    entry.current = 0
  }, [entryKey])

  const lightWorld = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const s = useStore.getState()
    const preset = presetById(s.material)
    blend.setTarget(preset)
    blend.step(delta)
    engine.update(delta)

    if (tilt.current) {
      tilt.current.rotation.x = engine.rotX
      tilt.current.rotation.y = engine.rotY
    }

    entry.current = Math.min(1, entry.current + delta * 3.2)
    const appear = entry.current * entry.current * (3 - 2 * entry.current)
    if (root.current) {
      root.current.scale.setScalar(fit * (0.972 + 0.028 * appear))
    }

    const u = holoMaterial.uniforms
    lightWorld.set(engine.lightX * 2.8, engine.lightY * 2.8, 1.6)
    u.uLight.value.copy(lightWorld)
    u.uCamera.value.copy(camera.position)

    const borderPx = s.border * BORDER_UNIT_PX
    const borderMode = s.borderMaterial === 'none' ? 0 : BORDER_MODE[s.borderMaterial]

    u.uBorderPx.value = borderPx
    u.uBorderMode.value = borderMode
    u.uOriginal.value = s.showOriginal ? 1 : 0
    u.uBase.value.copy(blend.base)
    u.uEnvLow.value.copy(blend.envLow)
    u.uEnvHigh.value.copy(blend.envHigh)
    u.uSpectralBias.value.copy(blend.bias)
    u.uKey.value = blend.get('key')
    u.uFill.value = blend.get('fill')
    u.uOpacity.value = appear
    u.uHolo.value = s.holo * blend.get('holoScale')
    u.uShine.value = s.shine * blend.get('shineScale')
    u.uTexture.value = s.texture
    u.uSaturation.value = blend.get('saturation')
    u.uPeriod.value = blend.get('period')
    u.uPeriodVar.value = blend.get('periodVar')
    // The Spectrum control rides on the preset's own pattern scale rather than
    // replacing it, so a film keeps its character across the whole range.
    u.uPatternScale.value = blend.get('patternScale') * (0.45 + s.spectrum * 1.5)
    u.uSwirl.value = blend.get('swirl')
    u.uCoverage.value = blend.get('coverage')
    u.uRoughness.value = blend.get('roughness')
    u.uAniso.value = blend.get('aniso')
    u.uFacet.value = blend.get('facet')
    u.uDepth.value = s.depth
    u.uLambdaShift.value = blend.get('lambdaShift')

    const e = edgeMaterial.uniforms
    e.uBorderPx.value = borderPx
    e.uBorderMode.value = borderMode
    e.uColor.value.setRGB(0.115, 0.112, 0.104)
    e.uOpacity.value = appear

    if (edge.current) {
      // Thickness scales with the depth control; the offset is what peeks out.
      edge.current.position.z = -0.004 - s.depth * 0.007
    }

    const sh = shadowMaterial.uniforms
    sh.uBorderPx.value = borderPx
    sh.uBorderMode.value = borderMode
    sh.uSpread.value = 16 + s.shadow * 34
    sh.uOpacity.value = s.shadow * 0.24 * appear
    sh.uSkew.value.set(engine.rotY * 0.30, -engine.rotX * 0.30)
    if (shadow.current) {
      shadow.current.position.set(
        engine.rotY * 0.075 - 0.006,
        engine.rotX * 0.075 - 0.020,
        -0.05,
      )
    }
  })

  return (
    <group ref={root} scale={fit}>
      <mesh ref={shadow} material={shadowMaterial} renderOrder={0}>
        <planeGeometry args={[planeWidth, planeHeight]} />
      </mesh>
      <group ref={tilt}>
        <mesh ref={edge} material={edgeMaterial} renderOrder={1}>
          <planeGeometry args={[planeWidth, planeHeight]} />
        </mesh>
        <mesh ref={surface} material={holoMaterial} renderOrder={2}>
          <planeGeometry args={[planeWidth, planeHeight]} />
        </mesh>
      </group>
    </group>
  )
}
