/**
 * The holographic film. One material, tuned rather than chosen.
 *
 * These are the parameters the shader needs that a person should not have to
 * think about. What is left on the panel — Holo, Shine, Glass, Depth — is what
 * actually changes the look of a sticker; everything here is the character of the
 * film itself and stays fixed.
 *
 * The film's colour comes from two optical path differences added together, and
 * these numbers are what set them. `filmThickness` gives the laminate's own
 * interference, which is what covers the sheet; `period` is the grating pitch,
 * which is what makes the colour sweep as the object turns. Their sum is kept
 * inside roughly 0.6–1.9um on purpose — enough that some interference order is
 * always inside the visible 0.40–0.70um window, and few enough orders that no two
 * of them are ever fully visible at once, which is what would turn the whole film
 * pale. `pearl` is how much white sits under the spectrum: near zero here, which is
 * the other half of keeping the colour saturated rather than pastel.
 */
export const FILM = {
  /** Silver body tint. */
  base: '#D9DAD6',
  /** The studio it reflects: floor tone and ceiling tone. */
  envLow: '#6E7274',
  envHigh: '#EAEBE7',
  /** Key and fill softbox strength. */
  key: 0.9,
  fill: 0.42,
  /** Per-channel weighting of the diffracted spectrum. */
  bias: [1, 1, 1] as [number, number, number],
  saturation: 1.5,
  /** How much white sits under the spectrum, 0 saturated to 1 white. */
  pearl: 0.02,
  /** Grating pitch, micrometres. */
  period: 0.82,
  /** Spatial variation of the pitch, which is most of what makes one region a
   *  different colour from its neighbour at a given orientation. */
  periodVar: 0.6,
  /** Band sweeps across the artwork. */
  flow: 3.0,
  /** How far the grating orientation drifts. */
  swirl: 0.5,
  /** Overall strength of the film. */
  coverage: 1.08,
  /** How far the laminate separates the channels at a bevel. */
  dispersion: 0.7,
  /** Strength of the studio's glints in this film's reflection. */
  sparkle: 0.7,
  /** Specular roughness and its stretch along the brushing. */
  roughness: 0.062,
  aniso: 0.3,
  /** Strength of the micro-roughness on the film. */
  facet: 0.8,
  /** Micrometres added to every wavelength. */
  lambdaShift: 0,
  /**
   * Laminate thickness in micrometres, and how far it wanders across the sheet.
   *
   * This is the half of the material that covers the surface. The grating's path
   * difference vanishes when the light is near the eye's axis, so on its own it
   * left most of a face-on sticker as bare chrome — measured, only a third of the
   * artwork carried any colour at all. Interference through a film of real
   * thickness is strongest exactly there, and adding it took coverage to about
   * four fifths without giving up the sweep.
   *
   * Holo scales this, so the slider runs from bare chrome through to a fully
   * coated sheet.
   */
  filmThickness: 0.375,
  filmVar: 0.43,
}
