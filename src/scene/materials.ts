import * as THREE from 'three'
import type { Artwork } from '../lib/artwork'
import type { MaterialPreset } from '../materials/presets'
import holoVert from '../shaders/holographic.vert.glsl?raw'
import holoFrag from '../shaders/holographic.frag.glsl?raw'
import silhouetteVert from '../shaders/silhouette.vert.glsl?raw'
import edgeFrag from '../shaders/edge.frag.glsl?raw'
import shadowFrag from '../shaders/shadow.frag.glsl?raw'

export interface ArtworkTextures {
  sdf: THREE.DataTexture
  color: THREE.DataTexture
  width: number
  height: number
  dispose: () => void
}

export function createArtworkTextures(artwork: Artwork): ArtworkTextures {
  const { width, height } = artwork

  // Half float so the border edge stays smooth: an 8-bit field quantises to a
  // third of a pixel over this range and the die cut visibly stair-steps.
  const sdf = new THREE.DataTexture(
    artwork.sdf,
    width,
    height,
    THREE.RedFormat,
    THREE.HalfFloatType,
  )
  sdf.minFilter = THREE.LinearFilter
  sdf.magFilter = THREE.LinearFilter
  sdf.generateMipmaps = false
  sdf.wrapS = THREE.ClampToEdgeWrapping
  sdf.wrapT = THREE.ClampToEdgeWrapping
  sdf.needsUpdate = true

  const color = new THREE.DataTexture(
    artwork.color,
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  )
  color.minFilter = THREE.LinearFilter
  color.magFilter = THREE.LinearFilter
  color.generateMipmaps = false
  color.wrapS = THREE.ClampToEdgeWrapping
  color.wrapT = THREE.ClampToEdgeWrapping
  color.needsUpdate = true

  return {
    sdf,
    color,
    width,
    height,
    dispose: () => {
      sdf.dispose()
      color.dispose()
    },
  }
}

export const BORDER_MODE: Record<string, number> = {
  none: 0,
  white: 1,
  silver: 2,
  holo: 3,
}

/** Interface border units (0–40) to mask pixels. */
export const BORDER_UNIT_PX = 1.3

export function createHoloMaterial(textures: ArtworkTextures) {
  const long = Math.max(textures.width, textures.height)
  return new THREE.ShaderMaterial({
    vertexShader: holoVert,
    fragmentShader: holoFrag,
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uSdf: { value: textures.sdf },
      uArtwork: { value: textures.color },
      uTexel: { value: new THREE.Vector2(1 / textures.width, 1 / textures.height) },
      uPatternAspect: {
        value: new THREE.Vector2(textures.width / long, textures.height / long),
      },
      uLight: { value: new THREE.Vector3(0.8, 1.6, 3.0) },
      uCamera: { value: new THREE.Vector3(0, 0, 7) },
      uBorderPx: { value: 16 },
      uBorderMode: { value: 1 },
      uOriginal: { value: 0 },
      uOpacity: { value: 1 },
      uBase: { value: new THREE.Color('#D9DAD6') },
      uEnvLow: { value: new THREE.Color('#585B5C') },
      uEnvHigh: { value: new THREE.Color('#EAEBE7') },
      uSpectralBias: { value: new THREE.Vector3(1, 1, 1) },
      uKey: { value: 0.86 },
      uFill: { value: 0.4 },
      uHolo: { value: 0.62 },
      uShine: { value: 0.6 },
      uTexture: { value: 0.45 },
      uSaturation: { value: 1 },
      uPeriod: { value: 1.55 },
      uPeriodVar: { value: 0.3 },
      uPatternScale: { value: 3.2 },
      uSwirl: { value: 0.55 },
      uCoverage: { value: 0.5 },
      uRoughness: { value: 0.085 },
      uAniso: { value: 0.35 },
      uFacet: { value: 1 },
      uDepth: { value: 0.42 },
      uLambdaShift: { value: 0 },
    },
  })
}

export function createEdgeMaterial(textures: ArtworkTextures) {
  return new THREE.ShaderMaterial({
    vertexShader: silhouetteVert,
    fragmentShader: edgeFrag,
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSdf: { value: textures.sdf },
      uArtwork: { value: textures.color },
      uBorderPx: { value: 16 },
      uBorderMode: { value: 1 },
      uColor: { value: new THREE.Color('#5C5C58') },
      uOpacity: { value: 1 },
    },
  })
}

export function createShadowMaterial(textures: ArtworkTextures) {
  return new THREE.ShaderMaterial({
    vertexShader: silhouetteVert,
    fragmentShader: shadowFrag,
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSdf: { value: textures.sdf },
      uBorderPx: { value: 16 },
      uBorderMode: { value: 1 },
      uSpread: { value: 26 },
      uOpacity: { value: 0.2 },
      uSkew: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color('#2A2822') },
    },
  })
}

/**
 * A preset with every field mutable, so switching films can be interpolated
 * rather than cut. Nobody asked for a transition; a hard swap simply looks like
 * two different pictures instead of one object changing material.
 */
export class MaterialBlend {
  base = new THREE.Color()
  envLow = new THREE.Color()
  envHigh = new THREE.Color()
  bias = new THREE.Vector3()
  private numeric: Record<string, number> = {}

  private targetBase = new THREE.Color()
  private targetEnvLow = new THREE.Color()
  private targetEnvHigh = new THREE.Color()
  private targetBias = new THREE.Vector3()
  private targetNumeric: Record<string, number> = {}

  private static readonly KEYS = [
    'key',
    'fill',
    'saturation',
    'period',
    'periodVar',
    'swirl',
    'patternScale',
    'coverage',
    'roughness',
    'aniso',
    'facet',
    'lambdaShift',
    'holoScale',
    'shineScale',
  ] as const

  constructor(preset: MaterialPreset) {
    this.setTarget(preset)
    this.base.copy(this.targetBase)
    this.envLow.copy(this.targetEnvLow)
    this.envHigh.copy(this.targetEnvHigh)
    this.bias.copy(this.targetBias)
    for (const key of MaterialBlend.KEYS) this.numeric[key] = this.targetNumeric[key]
  }

  setTarget(preset: MaterialPreset) {
    this.targetBase.set(preset.base)
    this.targetEnvLow.set(preset.envLow)
    this.targetEnvHigh.set(preset.envHigh)
    this.targetBias.set(preset.bias[0], preset.bias[1], preset.bias[2])
    for (const key of MaterialBlend.KEYS) this.targetNumeric[key] = preset[key]
  }

  get(key: (typeof MaterialBlend.KEYS)[number]) {
    return this.numeric[key]
  }

  step(dt: number) {
    const t = 1 - Math.exp(-dt * 7)
    this.base.lerp(this.targetBase, t)
    this.envLow.lerp(this.targetEnvLow, t)
    this.envHigh.lerp(this.targetEnvHigh, t)
    this.bias.lerp(this.targetBias, t)
    for (const key of MaterialBlend.KEYS) {
      this.numeric[key] += (this.targetNumeric[key] - this.numeric[key]) * t
    }
  }
}
