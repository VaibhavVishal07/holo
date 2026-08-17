/**
 * Seven holographic films.
 *
 * A preset is not a colour. Each one moves the base metal, the studio it
 * reflects, the grating period, how far the grating orientation wanders, how
 * much of the surface can diffract at all, the specular roughness and the foil's
 * facet structure. Two presets can share a spectrum and still look like
 * different products, which is the point.
 *
 * `period` is the grating pitch in micrometres. It decides the geometry at which
 * colour appears: visible light is 0.38–0.72um, so a 1.55um pitch first turns
 * violet once the half-angle sine reaches about 0.25 and has run through to red
 * by 0.46. Shorten it and the bands tighten and separate; lengthen it and colour
 * arrives later and stays pastel.
 */

export interface MaterialPreset {
  id: string
  name: string
  /** Silver body tint. */
  base: string
  /** The studio the metal reflects: floor tone and ceiling tone. */
  envLow: string
  envHigh: string
  /** Key and fill softbox strength. */
  key: number
  fill: number
  /** Per-channel weighting of the diffracted spectrum. */
  bias: [number, number, number]
  saturation: number
  /** Grating pitch, micrometres. */
  period: number
  /** Spatial variation of the pitch, 0–1. */
  periodVar: number
  /** How far the grating orientation swirls across the surface. */
  swirl: number
  /** Scale of the patchiness that decides where colour can appear. */
  patternScale: number
  /** How much of the surface is allowed to diffract, 0–1. */
  coverage: number
  /** Specular roughness. */
  roughness: number
  /** Specular stretch along the brushing. */
  aniso: number
  /** Strength of the crushed-foil facet structure. */
  facet: number
  /** Micrometres added to every wavelength — biases the whole film. */
  lambdaShift: number
  /** Multipliers applied on top of the Holo and Shine sliders. */
  holoScale: number
  shineScale: number
}

export const PRESETS: MaterialPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    base: '#D9DAD6',
    envLow: '#8A8D8E',
    envHigh: '#EAEBE7',
    key: 0.86,
    fill: 0.4,
    bias: [1, 1, 1],
    saturation: 1.0,
    period: 1.60,
    periodVar: 0.3,
    swirl: 0.42,
    patternScale: 7.0,
    coverage: 0.5,
    roughness: 0.085,
    aniso: 0.35,
    facet: 1.0,
    lambdaShift: 0,
    holoScale: 1.0,
    shineScale: 1.0,
  },
  {
    id: 'soft',
    name: 'Soft',
    base: '#DFDFDB',
    envLow: '#96999A',
    envHigh: '#EFEFEB',
    key: 0.72,
    fill: 0.52,
    bias: [1, 1, 1],
    saturation: 0.52,
    period: 1.80,
    periodVar: 0.4,
    swirl: 0.56,
    patternScale: 5.2,
    coverage: 0.46,
    roughness: 0.14,
    aniso: 0.28,
    facet: 0.66,
    lambdaShift: 0.005,
    holoScale: 0.88,
    shineScale: 0.82,
  },
  {
    id: 'prism',
    name: 'Prism',
    base: '#D5D7D4',
    envLow: '#7E8183',
    envHigh: '#E9EBE8',
    key: 0.94,
    fill: 0.34,
    bias: [1.04, 1.0, 1.06],
    saturation: 1.16,
    period: 1.28,
    periodVar: 0.13,
    swirl: 0.16,
    patternScale: 8.6,
    coverage: 0.64,
    roughness: 0.068,
    aniso: 0.2,
    facet: 0.46,
    lambdaShift: 0,
    holoScale: 1.16,
    shineScale: 1.0,
  },
  {
    id: 'chrome',
    name: 'Chrome',
    base: '#BABDBC',
    envLow: '#42464A',
    envHigh: '#F4F5F2',
    key: 1.2,
    fill: 0.26,
    bias: [1, 1, 1.02],
    saturation: 0.94,
    period: 1.64,
    periodVar: 0.24,
    swirl: 0.34,
    patternScale: 8.0,
    coverage: 0.33,
    roughness: 0.042,
    aniso: 0.5,
    facet: 0.5,
    lambdaShift: 0,
    holoScale: 0.8,
    shineScale: 1.38,
  },
  {
    id: 'ice',
    name: 'Ice',
    base: '#CFD6DA',
    envLow: '#79868D',
    envHigh: '#E7EEF2',
    key: 0.9,
    fill: 0.48,
    bias: [0.7, 1.0, 1.3],
    saturation: 1.06,
    period: 1.52,
    periodVar: 0.28,
    swirl: 0.40,
    patternScale: 7.4,
    coverage: 0.5,
    roughness: 0.075,
    aniso: 0.34,
    facet: 0.92,
    lambdaShift: -0.045,
    holoScale: 1.0,
    shineScale: 1.08,
  },
  {
    id: 'warm',
    name: 'Warm',
    base: '#DFD7C8',
    envLow: '#8D857A',
    envHigh: '#F1EBE1',
    key: 0.84,
    fill: 0.42,
    bias: [1.24, 1.02, 0.7],
    saturation: 1.0,
    period: 1.68,
    periodVar: 0.32,
    swirl: 0.45,
    patternScale: 6.8,
    coverage: 0.42,
    roughness: 0.095,
    aniso: 0.38,
    facet: 0.95,
    lambdaShift: 0.05,
    holoScale: 0.94,
    shineScale: 0.98,
  },
  {
    id: 'candy',
    name: 'Candy',
    base: '#D9D4D8',
    envLow: '#847C88',
    envHigh: '#EDE9EE',
    key: 0.88,
    fill: 0.44,
    bias: [1.2, 0.74, 1.26],
    saturation: 1.12,
    period: 1.44,
    periodVar: 0.26,
    swirl: 0.62,
    patternScale: 11.0,
    coverage: 0.55,
    roughness: 0.08,
    aniso: 0.3,
    facet: 0.85,
    lambdaShift: -0.018,
    holoScale: 1.06,
    shineScale: 1.04,
  },
]

export const DEFAULT_PRESET = PRESETS[0]

export function presetById(id: string): MaterialPreset {
  return PRESETS.find((p) => p.id === id) ?? DEFAULT_PRESET
}
