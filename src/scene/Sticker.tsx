import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Artwork } from '../lib/artwork'
import { FILM } from '../materials/film'
import type { TiltEngine } from '../hooks/useTilt'
import { useStore } from '../state/store'
import {
  BORDER_MODE,
  BORDER_UNIT_PX,
  createArtworkTextures,
  createHoloMaterial,
  createShadowMaterial,
} from './materials'
import { buildStickerGeometry, sheetThickness } from './stickerGeometry'
import { lightHandle, motionHandle, sceneHandle } from './handle'

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
    // Seeded neutral; the frame loop below owns it from the first frame on.
    lightHandle.current = { x: 0.34, y: 0.4 }
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
      lightHandle.current = null
    }
  }, [gl, scene, camera, planeWidth, planeHeight])

  // Fade the new material in rather than cutting to it.
  const entry = useRef(0)
  useEffect(() => {
    entry.current = 0
  }, [entryKey])

  const lightWorld = useMemo(() => new THREE.Vector3(), [])

  // Hue is the one film property that gets its own easing. Everything else on the
  // panel is a property of the material and should answer immediately, but a
  // colour that slides round to its new value reads as the same piece of foil
  // turning — and it is what makes Shuffle land as an event rather than a cut.
  const easedHue = useRef(useStore.getState().hue)

  useFrame((_, delta) => {
    const s = useStore.getState()
    engine.update(delta)

    // The motion recorder drives the pose directly while it is running, so what
    // gets captured is this scene rather than a second simulation of it.
    const scripted = motionHandle.current?.override?.(performance.now())
    const rotX = scripted ? scripted.rotX : engine.rotX
    const rotY = scripted ? scripted.rotY : engine.rotY
    const lightX = scripted ? scripted.lightX : engine.lightX
    const lightY = scripted ? scripted.lightY : engine.lightY
    if (lightHandle.current) {
      lightHandle.current.x = lightX
      lightHandle.current.y = lightY
    }

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
    // Angle decides how grazing the light is, which is the single most
    // consequential light parameter here: the half-angle sets which wavelengths
    // can reach the eye at all, so raking the light widens the spectrum on offer.
    lightWorld.set(lightX * 2.8, lightY * 2.8, 3.4 - s.lightAngle * 2.5)
    u.uLight.value.copy(lightWorld)
    u.uCamera.value.copy(camera.position)

    const borderPx = s.border * BORDER_UNIT_PX
    const borderMode = s.borderMaterial === 'none' ? 0 : BORDER_MODE[s.borderMaterial]

    u.uBorderPx.value = borderPx
    u.uBorderMode.value = borderMode
    u.uOriginal.value = s.showOriginal ? 1 : 0
    u.uBase.value.set(FILM.base)
    u.uEnvLow.value.set(FILM.envLow)
    u.uEnvHigh.value.set(FILM.envHigh)
    u.uSpectralBias.value.set(FILM.bias[0], FILM.bias[1], FILM.bias[2])
    u.uKey.value = FILM.key
    u.uFill.value = FILM.fill
    u.uOpacity.value = appear
    u.uHolo.value = s.holo
    u.uShine.value = s.shine
    // Grain follows the film's own facet character rather than a separate control.
    u.uTexture.value = 0.22 + FILM.facet * 0.34
    u.uSaturation.value = FILM.saturation
    u.uPearl.value = FILM.pearl
    u.uGlass.value = 0.35 + s.glass * 1.45
    u.uDispersion.value = FILM.dispersion
    u.uSparkle.value = FILM.sparkle
    u.uPeriod.value = FILM.period
    u.uPeriodVar.value = FILM.periodVar
    u.uFlow.value = FILM.flow
    u.uSwirl.value = FILM.swirl
    u.uCoverage.value = FILM.coverage
    u.uRoughness.value = FILM.roughness
    u.uAniso.value = FILM.aniso
    u.uFacet.value = FILM.facet
    u.uDepth.value = s.depth
    u.uLambdaShift.value = FILM.lambdaShift

    // Hue lives on a circle, so 0.95 to 0.05 has to travel forward through 1
    // rather than all the way back through green.
    let dh = s.hue - easedHue.current
    dh -= Math.round(dh)
    easedHue.current = (easedHue.current + dh * Math.min(1, delta * 4.2) + 1) % 1
    u.uHue.value = easedHue.current

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
