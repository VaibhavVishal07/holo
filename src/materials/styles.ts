/**
 * Nine holographic styles.
 *
 * A preset is not a colour. Each one moves the base metal, the studio it
 * reflects, the grating pitch, how far the pitch and orientation drift, how many
 * band sweeps cross the artwork, how much white sits under the spectrum, the
 * specular roughness and anisotropy, and the spectral bias. Two presets can share
 * a spectrum and still look like different products, which is the point.
 *
 * `period` is the grating pitch in micrometres. It decides the geometry at which
 * colour appears: visible light is 0.40-0.70um, so at a 1.6um pitch the film turns
 * violet once the half-angle sine reaches about 0.25 and has run through to red by
 * 0.44. Shorten it and the bands tighten; lengthen it and colour arrives later.
 *
 * `pearl` is the calibration knob against real film. Soft pastel stationery foil
 * carries a lot of white under the spectrum; saturated rainbow chrome carries
 * almost none.
 *
 * `glass` is the laminate over the foil, and `dispersion` is how far it separates
 * the channels at a bevel. Together they are the difference between bare film and
 * something printed, laminated and glossy — the coloured fringe along an edge is
 * the most recognisable thing about the latter.
 */

export interface HoloStyle {
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
  /** How much white sits under the spectrum, 0 saturated to 1 white. */
  pearl: number
  /** Strength of the clear laminate over the foil. */
  glass: number
  /** How far the laminate separates the channels at a bevel. */
  dispersion: number
  /** Strength of the studio's glints in this film's reflection. */
  sparkle: number
  /** Grating pitch, micrometres. */
  period: number
  /** Spatial variation of the pitch, 0-1. */
  periodVar: number
  /** Band sweeps across the artwork. Low is one broad sweep, high is several. */
  flow: number
  /** How far the grating orientation drifts. */
  swirl: number
  /** Overall strength of the film. */
  coverage: number
  /** Specular roughness. */
  roughness: number
  /** Specular stretch along the brushing. */
  aniso: number
  /** Strength of the micro-roughness on the film. */
  facet: number
  /** Micrometres added to every wavelength - biases the whole film. */
  lambdaShift: number
  /** Multipliers applied on top of the Holo and Shine sliders. */
  holoScale: number
  shineScale: number
}

export const STYLES: HoloStyle[] = [
  {
    id: 'classic',
    name: 'Classic',
    base: '#D9DAD6',
    envLow: '#6E7274',
    envHigh: '#EAEBE7',
    key: 0.86,
    fill: 0.4,
    bias: [1, 1, 1],
    saturation: 1.16,
    pearl: 0.05,
    glass: 0.55,
    dispersion: 0.55,
    sparkle: 0.55,
    period: 1.6,
    periodVar: 0.62,
    flow: 2.4,
    swirl: 0.45,
    coverage: 1.0,
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
    envLow: '#7E8182',
    envHigh: '#EFEFEB',
    key: 0.72,
    fill: 0.52,
    bias: [1, 1, 1],
    saturation: 0.66,
    pearl: 0.46,
    glass: 0.4,
    dispersion: 0.3,
    sparkle: 0.25,
    period: 1.78,
    periodVar: 0.70,
    flow: 1.9,
    swirl: 0.58,
    coverage: 0.9,
    roughness: 0.14,
    aniso: 0.28,
    facet: 0.66,
    lambdaShift: 0.005,
    holoScale: 0.9,
    shineScale: 0.82,
  },
  {
    id: 'prism',
    name: 'Prism',
    base: '#D5D7D4',
    envLow: '#5F6365',
    envHigh: '#E9EBE8',
    key: 0.94,
    fill: 0.34,
    bias: [1.04, 1.0, 1.06],
    saturation: 1.16,
    pearl: 0.05,
    glass: 0.7,
    dispersion: 0.95,
    sparkle: 0.9,
    period: 1.3,
    periodVar: 0.46,
    flow: 3.6,
    swirl: 0.3,
    coverage: 1.22,
    roughness: 0.068,
    aniso: 0.2,
    facet: 0.46,
    lambdaShift: 0,
    holoScale: 1.1,
    shineScale: 1.0,
  },
  {
    id: 'glass',
    name: 'Glass',
    base: '#C9CED6',
    envLow: '#4C545F',
    envHigh: '#EEF2F6',
    key: 1.0,
    fill: 0.56,
    bias: [1.02, 0.96, 1.14],
    saturation: 1.0,
    pearl: 0.30,
    glass: 1.0,
    dispersion: 0.85,
    sparkle: 1.0,
    period: 1.72,
    periodVar: 0.5,
    flow: 1.7,
    swirl: 0.5,
    coverage: 0.92,
    roughness: 0.03,
    aniso: 0.1,
    facet: 0.3,
    lambdaShift: 0,
    holoScale: 0.95,
    shineScale: 1.3,
  },
  {
    id: 'chrome',
    name: 'Chrome',
    base: '#BABDBC',
    envLow: '#2E3236',
    envHigh: '#F4F5F2',
    key: 1.2,
    fill: 0.26,
    bias: [1, 1, 1.02],
    saturation: 0.94,
    pearl: 0.18,
    glass: 0.85,
    dispersion: 0.45,
    sparkle: 0.95,
    period: 1.66,
    periodVar: 0.64,
    flow: 2.1,
    swirl: 0.36,
    coverage: 0.62,
    roughness: 0.042,
    aniso: 0.5,
    facet: 0.5,
    lambdaShift: 0,
    holoScale: 0.85,
    shineScale: 1.38,
  },
  {
    id: 'ice',
    name: 'Ice',
    base: '#CFD6DA',
    envLow: '#5D6A72',
    envHigh: '#E7EEF2',
    key: 0.9,
    fill: 0.48,
    bias: [0.7, 1.0, 1.3],
    saturation: 1.06,
    pearl: 0.06,
    glass: 0.6,
    dispersion: 0.6,
    sparkle: 0.6,
    period: 1.54,
    periodVar: 0.58,
    flow: 2.5,
    swirl: 0.42,
    coverage: 1.02,
    roughness: 0.075,
    aniso: 0.34,
    facet: 0.92,
    lambdaShift: -0.04,
    holoScale: 1.0,
    shineScale: 1.08,
  },
  {
    id: 'warm',
    name: 'Warm',
    base: '#DFD7C8',
    envLow: '#726B62',
    envHigh: '#F1EBE1',
    key: 0.84,
    fill: 0.42,
    bias: [1.24, 1.02, 0.7],
    saturation: 1.0,
    pearl: 0.17,
    glass: 0.45,
    dispersion: 0.45,
    sparkle: 0.4,
    period: 1.7,
    periodVar: 0.60,
    flow: 2.2,
    swirl: 0.46,
    coverage: 0.96,
    roughness: 0.095,
    aniso: 0.38,
    facet: 0.95,
    lambdaShift: 0.045,
    holoScale: 0.98,
    shineScale: 0.98,
  },
  {
    id: 'oil',
    name: 'Oil',
    base: '#CBCED0',
    envLow: '#4E5256',
    envHigh: '#E8EBEC',
    key: 0.92,
    fill: 0.38,
    bias: [1.08, 1.0, 1.08],
    saturation: 1.3,
    pearl: 0.0,
    glass: 0.75,
    dispersion: 0.7,
    sparkle: 0.75,
    period: 1.34,
    periodVar: 0.44,
    flow: 3.1,
    swirl: 0.7,
    coverage: 1.35,
    roughness: 0.055,
    aniso: 0.22,
    facet: 0.55,
    lambdaShift: 0,
    holoScale: 1.2,
    shineScale: 1.05,
  },
  {
    id: 'candy',
    name: 'Candy',
    base: '#D9D4D8',
    envLow: '#6A6270',
    envHigh: '#EDE9EE',
    key: 0.88,
    fill: 0.44,
    bias: [1.2, 0.74, 1.26],
    saturation: 1.12,
    pearl: 0.04,
    glass: 0.65,
    dispersion: 0.8,
    sparkle: 0.7,
    period: 1.46,
    periodVar: 0.56,
    flow: 2.8,
    swirl: 0.6,
    coverage: 1.14,
    roughness: 0.08,
    aniso: 0.3,
    facet: 0.85,
    lambdaShift: -0.015,
    holoScale: 1.04,
    shineScale: 1.04,
  },
]

export const DEFAULT_STYLE = STYLES[0]

export function styleById(id: string): HoloStyle {
  return STYLES.find((s) => s.id === id) ?? DEFAULT_STYLE
}
