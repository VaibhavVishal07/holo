/**
 * The holographic film. One material, tuned rather than chosen.
 *
 * These are the parameters the shader needs that a person should not have to
 * think about. What is left on the panel — Holo, Shine, Glass, Depth — is what
 * actually changes the look of a sticker; everything here is the character of the
 * film itself and stays fixed.
 *
 * `period` is the grating pitch in micrometres, and it decides the geometry at
 * which colour appears: visible light is 0.40–0.70um, so at this pitch the film
 * turns violet once the half-angle sine reaches about 0.25 and has run through to
 * red by 0.44. `pearl` is how much white sits under the spectrum — near zero here,
 * which is what keeps the colour saturated rather than pastel.
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
  saturation: 1.3,
  /** How much white sits under the spectrum, 0 saturated to 1 white. */
  pearl: 0.02,
  /** Grating pitch, micrometres. */
  period: 1.56,
  /** Spatial variation of the pitch. This swing is what leaves chrome between
   *  the sweeps: where it carries the wavelength outside the visible band, the
   *  surface simply goes back to reflecting the room. */
  periodVar: 0.6,
  /** Band sweeps across the artwork. */
  flow: 2.5,
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
}
