import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Artwork } from '../lib/artwork'
import { styleById } from '../materials/styles'
import type { TiltEngine } from '../hooks/useTilt'
import { useStore } from '../state/store'
import {
  BORDER_MODE,
  BORDER_UNIT_PX,
  StyleBlend,
  createArtworkTextures,
  createHoloMaterial,
  createShadowMaterial,
} from './materials'
import { buildStickerGeometry, sheetThickness } from './stickerGeometry'
import { motionHandle, sceneHandle } from './handle'

/** Fraction of the shorter viewport axis the artwork should occupy. */
const FILL = 0.80

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

  const { camera, gl, scene, viewport } = useThree()

  // Only these two reshape the mesh, so they are read as state rather than from
  // the frame loop — a change here is a geometry rebuild, not a uniform write.
  const border = useStore((s) => s.border)
  const borderMaterial = useStore((s) => s.borderMaterial)

  const textures = useMemo(() => createArtworkTextures(artwork), [artwork])
  const holoMaterial = useMemo(() => createHoloMaterial(textures), [textures])
  const shadowMaterial = useMemo(() => createShadowMaterial(textures), [textures])

  useEffect(
    () => () => {
      holoMaterial.dispose()
      shadowMaterial.dispose()
      textures.dispose()
    },
    [holoMaterial, shadowMaterial, textures],
  )

  const blend = useMemo(
    () => new StyleBlend(styleById(useStore.getState().style)),
    [],
  )

  // The padded mask's aspect; the padding is where the die cut and the shadow
  // live.
  const long = Math.max(artwork.width, artwork.height)
  const planeWidth = artwork.width / long
  const planeHeight = artwork.height / long

  // The die-cut outline traced and extruded. Only the border width changes the
  // outline, so depth stays free of rebuilds — it is applied by scaling z.
  const borderUnits = borderMaterial === 'none' ? 0 : border
  const solid = useMemo(
    () => buildStickerGeometry(artwork, borderUnits * BORDER_UNIT_PX),
    [artwork, borderUnits],
  )
  useEffect(() => () => solid?.geometry.dispose(), [solid])

  useEffect(() => {
    holoMaterial.uniforms.uTrim.value = 0
    holoMaterial.uniforms.uPlaneSize.value.set(planeWidth, planeHeight)
  }, [holoMaterial, planeWidth, planeHeight])

  // Scale so the artwork itself — not the padding — fills the frame.
  const fit = useMemo(() => {
    const contentW = artwork.contentWidth / long
    const contentH = artwork.contentHeight / long
    return FILL / Math.max(contentW / viewport.width, contentH / viewport.height)
  }, [artwork.contentWidth, artwork.contentHeight, long, viewport.width, viewport.height])

  useLayoutEffect(() => {
    if (!root.current || !tilt.current || !shadow.current) return
    motionHandle.current = { canvas: gl.domElement, override: null }
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
      motionHandle.current = null
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
    blend.setTarget(styleById(s.style))
    blend.step(delta)
    engine.update(delta)

    // The motion recorder drives the pose directly while it is running, so what
    // gets captured is this scene rather than a second simulation of it.
    const scripted = motionHandle.current?.override?.(performance.now())
    const rotX = scripted ? scripted.rotX : engine.rotX
    const rotY = scripted ? scripted.rotY : engine.rotY
    const lightX = scripted ? scripted.lightX : engine.lightX
    const lightY = scripted ? scripted.lightY : engine.lightY

    if (tilt.current) {
      tilt.current.rotation.x = rotX
      tilt.current.rotation.y = rotY
    }

    entry.current = Math.min(1, entry.current + delta * 3.2)
    const appear = entry.current * entry.current * (3 - 2 * entry.current)
    if (root.current) {
      root.current.scale.setScalar(fit * (0.972 + 0.028 * appear))
    }

    const u = holoMaterial.uniforms
    lightWorld.set(lightX * 2.8, lightY * 2.8, 1.6)
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
    u.uPearl.value = blend.get('pearl')
    u.uGlass.value = blend.get('glass')
    u.uDispersion.value = blend.get('dispersion')
    u.uSparkle.value = blend.get('sparkle')
    u.uPeriod.value = blend.get('period')
    u.uPeriodVar.value = blend.get('periodVar')
    // Spectrum rides on the preset's own band count rather than replacing it, so
    // a film keeps its character across the whole range.
    u.uFlow.value = blend.get('flow') * (0.5 + s.spectrum * 1.3)
    u.uSwirl.value = blend.get('swirl')
    u.uCoverage.value = blend.get('coverage')
    u.uRoughness.value = blend.get('roughness')
    u.uAniso.value = blend.get('aniso')
    u.uFacet.value = blend.get('facet')
    u.uDepth.value = s.depth
    u.uLambdaShift.value = blend.get('lambdaShift')

    if (tilt.current) {
      // Depth is baked at one unit, so the sheet's thickness is just a scale.
      tilt.current.scale.z = sheetThickness(s.depth)
    }

    const sh = shadowMaterial.uniforms
    sh.uBorderPx.value = borderPx
    sh.uBorderMode.value = borderMode
    sh.uSpread.value = 11 + s.shadow * 26
    sh.uOpacity.value = s.shadow * 0.28 * appear
    sh.uSkew.value.set(rotY * 0.30, -rotX * 0.30)
    if (shadow.current) {
      shadow.current.position.set(rotY * 0.075 - 0.006, rotX * 0.075 - 0.020, -0.05)
    }
  })

  return (
    <group ref={root} scale={fit}>
      <mesh ref={shadow} material={shadowMaterial} renderOrder={0}>
        <planeGeometry args={[planeWidth, planeHeight]} />
      </mesh>
      <group ref={tilt}>
        {solid && (
          <mesh
            ref={surface}
            material={holoMaterial}
            geometry={solid.geometry}
            renderOrder={1}
          />
        )}
      </group>
    </group>
  )
}
