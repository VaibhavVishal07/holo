// ---------------------------------------------------------------------------
// Holographic silver vinyl.
//
// The material is silver first. Colour is not painted on; it is what happens
// when a diffraction grating happens to be oriented such that a visible
// wavelength reflects from the light towards the eye. Everywhere else the
// surface keeps reflecting the room, which is why most of it stays chrome.
//
// Per fragment:
//   1. read the signed distance field, resolve artwork / border / outside
//   2. build a surface normal: lazy vinyl undulation, foil facets, brushing, grain
//   3. reflect the room into it -> the metal
//   4. solve the grating equation against the half-vector -> the spectrum
//   5. add one broad specular lobe -> the wet gloss
// ---------------------------------------------------------------------------

layout(location = 0) out vec4 fragColor;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vBitangent;

uniform sampler2D uSdf;      // R: signed distance to the artwork contour, in mask px
uniform sampler2D uArtwork;  // RGB: source artwork (sRGB), A: mask
uniform vec2 uTexel;         // 1 / mask resolution
uniform vec2 uPatternAspect; // keeps the foil pattern square on non-square art

uniform vec3 uLight;         // virtual light, world space
uniform vec3 uCamera;        // camera position, world space

uniform float uBorderPx;
uniform float uBorderMode;   // 0 none · 1 white · 2 silver · 3 holographic
uniform float uOriginal;     // 0 material, 1 the untouched upload
uniform float uOpacity;      // entry fade

// Material, driven by the presets and the sliders.
uniform vec3 uBase;          // silver body tint
uniform vec3 uEnvLow;        // the floor of the room
uniform vec3 uEnvHigh;       // the ceiling of the room
uniform vec3 uSpectralBias;  // per-channel weighting of the spectrum
uniform float uKey;
uniform float uFill;
uniform float uHolo;         // diffraction strength
uniform float uShine;        // specular strength
uniform float uTexture;      // grain + brushing amount
uniform float uSaturation;
uniform float uPeriod;       // grating pitch, micrometres
uniform float uPeriodVar;
uniform float uPatternScale;
uniform float uSwirl;        // how far the grating orientation wanders
uniform float uCoverage;     // fraction of the surface that can diffract at all
uniform float uRoughness;
uniform float uAniso;
uniform float uFacet;
uniform float uDepth;        // bevel width at the die cut, and vinyl waviness
uniform float uLambdaShift;  // micrometres, biases the whole film warm or cool

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

// --- noise -----------------------------------------------------------------

float hash(vec2 p) {
  p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
  return fract(p.x * p.y * (p.x + p.y));
}

/** Value noise carrying its analytic gradient: (value, d/dx, d/dy). */
vec3 vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 du = 6.0 * f * (1.0 - f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  float k1 = b - a;
  float k2 = c - a;
  float k3 = a - b - c + d;

  return vec3(
    a + k1 * u.x + k2 * u.y + k3 * u.x * u.y,
    (k1 + k3 * u.y) * du.x,
    (k2 + k3 * u.x) * du.y
  );
}

float noise(vec2 p) { return vnoise(p).x; }

/** Two-octave fbm with gradient, for normal perturbation. */
vec3 fbmd(vec2 p) {
  vec3 a = vnoise(p);
  vec3 b = vnoise(p * 2.03 + 17.1);
  return vec3(
    a.x * 0.66 + b.x * 0.34,
    a.y * 0.66 + b.y * 0.69,
    a.z * 0.66 + b.z * 0.69
  );
}

/**
 * Three-octave fbm. Each octave is rotated as well as scaled: without that, the
 * value-noise lattices stack up and the diffraction patches read as
 * axis-aligned blocks once the field is pushed for contrast.
 */
float fbm3(vec2 p) {
  const mat2 turn = mat2(0.80, 0.60, -0.60, 0.80);
  float v = noise(p) * 0.54;
  p = turn * p * 2.17 + 5.2;
  v += noise(p) * 0.30;
  p = turn * p * 2.03 + 11.3;
  v += noise(p) * 0.16;
  return v;
}

// --- spectrum ---------------------------------------------------------------

vec3 bump3(vec3 x, vec3 y) {
  vec3 v = 1.0 - x * x;
  return max(v - y, vec3(0.0));
}

/**
 * Visible spectrum as RGB, wavelength in nanometres. Six-lobe fit of the CIE
 * response — the ramps are smooth and the primaries land where the eye expects,
 * which is what keeps green→yellow→orange transitions from reading as neon.
 */
vec3 spectral(float nm) {
  float x = clamp((nm - 400.0) / 300.0, 0.0, 1.0);
  return
    bump3(vec3(3.54585104, 2.93225262, 2.41593945) * (x - vec3(0.69549072, 0.49228336, 0.27699880)),
          vec3(0.02312639, 0.15225084, 0.52607955)) +
    bump3(vec3(3.90307140, 3.21182957, 3.96587128) * (x - vec3(0.11748627, 0.86755042, 0.66077860)),
          vec3(0.84897130, 0.88445281, 0.73949448));
}

/**
 * Rolls the spectrum off at both ends of vision instead of clipping it.
 *
 * The window is kept strictly inside `spectral`'s 400–700nm domain. If it reaches
 * past either end there is a band of wavelengths where the diffraction has energy
 * but the fit returns near-black, and that paints a grey rim around every patch of
 * colour on the sticker.
 */
float visible(float um) {
  return smoothstep(0.402, 0.432, um) * (1.0 - smoothstep(0.662, 0.696, um));
}

// --- the room ---------------------------------------------------------------

float softRect(vec2 p, vec2 halfSize, float soft) {
  vec2 q = abs(p) - halfSize;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(-soft * 0.55, soft, d);
}

/**
 * A small procedural studio, sampled by the reflection vector projected onto a
 * virtual wall and magnified.
 *
 * Two decisions here do all the work. The horizon puts a bright ceiling above a
 * dark floor, so a couple of degrees of tilt swings the silver across most of its
 * range — that swing is the entire reason the surface reads as metal rather than
 * as grey paint. And the key softbox sits with its lower edge just above the
 * neutral view, so the sticker is always on the verge of catching it.
 */
vec3 room(vec3 r) {
  vec2 p = (r.xy / max(0.30, r.z)) * 3.4;

  vec3 c = mix(uEnvLow, uEnvHigh, smoothstep(-1.05, 0.30, p.y));

  float key = softRect(p - vec2(-0.10, 0.62), vec2(0.85, 0.50), 0.34);
  float fill = softRect(p - vec2(1.15, 0.02), vec2(0.24, 0.60), 0.30);
  float occluder = softRect(p - vec2(-0.50, -1.00), vec2(0.95, 0.70), 0.80);

  c += vec3(1.0, 0.995, 0.982) * key * uKey * 0.62;
  c += vec3(0.88, 0.94, 1.0) * fill * uFill * 0.60;
  c *= 1.0 - occluder * 0.24;

  return c;
}

// --- reflectance ------------------------------------------------------------

/** Anisotropic GGX normal distribution, stretched along the brushing. */
float ggx(vec3 n, vec3 h, vec3 t, vec3 b, float rough, float aniso) {
  float ax = max(0.02, rough * (1.0 + aniso * 2.2));
  float ay = max(0.02, rough * (1.0 - aniso * 0.55));
  float th = dot(t, h) / ax;
  float bh = dot(b, h) / ay;
  float nh = max(dot(n, h), 0.0);
  float d = th * th + bh * bh + nh * nh;
  return 1.0 / (PI * ax * ay * d * d);
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

/** Lets bright reflections approach white smoothly rather than clipping flat. */
vec3 shoulder(vec3 c) {
  vec3 over = max(c - 0.78, 0.0);
  return min(c, 0.78 + over / (1.0 + 5.0 * over));
}

float sdfAt(vec2 uv) {
  // The mask arrives top-row-first, so v is flipped here and every derivative
  // taken from this function stays in plane space.
  return texture2D(uSdf, vec2(uv.x, 1.0 - uv.y)).r;
}

// ---------------------------------------------------------------------------

void main() {
  float d = sdfAt(vUv);
  float border = uBorderMode < 0.5 ? 0.0 : uBorderPx;

  // Artwork edge comes from the mask's own anti-aliasing, which is finer than
  // anything the distance field can reconstruct. The die cut comes from the
  // field, so its width is free.
  vec4 art = texture2D(uArtwork, vec2(vUv.x, 1.0 - vUv.y));
  float aa = max(fwidth(d), 0.6);
  float cutAlpha = 1.0 - smoothstep(border - aa, border + aa, d);
  float alpha = max(art.a, cutAlpha);
  if (alpha < 0.002) discard;

  float inBorder = clamp(cutAlpha - art.a, 0.0, 1.0);

  // --- surface ---
  vec3 n = normalize(vNormal);
  vec3 t = normalize(vTangent);
  vec3 b = normalize(vBitangent);

  vec2 pUv = vUv * uPatternAspect;

  // Vinyl is never dead flat. This large, slow waviness is the single biggest
  // reason the specular sweep looks handmade rather than computed.
  vec3 wave = fbmd(pUv * 2.4 + 4.7);
  // Foil facets: the crushed structure that scatters the rainbow into patches
  // instead of bands.
  vec3 facet = fbmd(pUv * 21.0 + 21.3);
  // Brushing runs along X, so the height varies across Y.
  float brush = noise(vec2(pUv.x * 46.0, pUv.y * 380.0)) - 0.5;
  float grain = noise(pUv * 640.0) - 0.5;
  // Both are fine enough to alias once a cell falls below a pixel; fade them out
  // exactly where that starts rather than letting the surface fizz.
  grain *= 1.0 - smoothstep(0.30, 0.85, fwidth(pUv.x) * 640.0);
  brush *= 1.0 - smoothstep(0.30, 0.85, fwidth(pUv.y) * 380.0);

  // Two normals, because the film sits on the vinyl but the roughness sits on the
  // film. The grating follows the sheet's real shape; grain and brushing are
  // finer than the grating and only scatter the specular.
  vec2 slopeMacro = wave.yz * (0.034 + uDepth * 0.056) + facet.yz * uFacet * 0.0020;
  vec2 slopeMicro =
    facet.yz * uFacet * 0.0038 +
    vec2(grain * 0.6, grain) * uTexture * 0.013 +
    vec2(0.0, brush) * uTexture * 0.007;

  // Bevel the die cut so the vinyl reads as having thickness once it turns. This
  // is real geometry, so it belongs to both normals.
  float bevelWidth = 1.2 + uDepth * 3.4;
  float rim = 1.0 - smoothstep(0.0, bevelWidth, border - d);
  vec2 cutGrad = vec2(
    sdfAt(vUv + vec2(uTexel.x, 0.0)) - sdfAt(vUv - vec2(uTexel.x, 0.0)),
    sdfAt(vUv + vec2(0.0, uTexel.y)) - sdfAt(vUv - vec2(0.0, uTexel.y))
  );
  float gradLen = length(cutGrad);
  if (gradLen > 1e-5) slopeMacro += (cutGrad / gradLen) * rim * 0.32;

  vec3 nMacro = normalize(n + t * slopeMacro.x + b * slopeMacro.y);
  n = normalize(nMacro + t * slopeMicro.x + b * slopeMicro.y);

  vec3 v = normalize(uCamera - vWorldPos);
  vec3 l = normalize(uLight - vWorldPos);
  vec3 h = normalize(v + l);

  float ndv = max(dot(n, v), 0.0);
  float lit = smoothstep(-0.05, 0.35, dot(n, l));

  // --- the metal ---
  vec3 env = room(reflect(-v, n));
  float envLuma = dot(env, vec3(0.2126, 0.7152, 0.0722));

  // Restrained Fresnel: silver is already reflective everywhere, so this only
  // has to lift the grazing edges a little.
  float fresnel = pow(1.0 - ndv, 4.5);
  vec3 metal = env * uBase * (1.0 + fresnel * 0.5) * (0.93 + facet.x * 0.15);

  // Gloss is mostly the reflected sources, not a point highlight. On a sheet this
  // flat, under a light this far off axis, a tight lobe never fires — so Shine has
  // to act on the part of the reflection that is actually the light: the bright
  // excess where the softbox lands. Low Shine reads satin, high Shine takes that
  // reflection to near-white.
  float sources = max(0.0, envLuma - 0.70);
  metal *= 1.0 + sources * (uShine - 0.30) * 1.15;

  // --- diffraction ---
  // The grating lives in the plane of the film, so the half-vector has to be
  // resolved in the frame of the *perturbed* surface. This is the join that makes
  // the effect physical: rotate the sticker, the frame rotates with it, and the
  // wavelength that reaches the eye changes because the geometry changed.
  vec3 tl = normalize(t - nMacro * dot(nMacro, t));
  vec3 bl = cross(nMacro, tl);
  // In-plane length of the half-vector is the sine of the half angle, which is
  // exactly the term the grating equation needs.
  vec2 hp = vec2(dot(h, tl), dot(h, bl));

  // Foil is a mosaic: the grating holds one orientation across a domain and then
  // steps to another. Quantising the orientation field is what produces coherent
  // patches of a single colour with definite boundaries. A continuous field
  // instead sweeps the wavelength smoothly and the whole surface reads as
  // airbrushed rainbow, which is the failure mode to avoid.
  float raw = noise(pUv * 5.2) * 7.0;
  float stepped = floor(raw) + smoothstep(0.40, 0.60, fract(raw));
  float angle = (stepped / 7.0 - 0.5) * TAU * uSwirl;
  vec2 g0 = vec2(cos(angle), sin(angle));
  vec2 g1 = vec2(-g0.y, g0.x);

  // Two fields, deliberately different in character.
  //
  // Where the film can diffract at all is elongated along the grooves, which is
  // what gives the colour its directional, drawn-out shapes rather than round
  // clouds. But the pitch — and therefore the hue — has to stay broad and
  // isotropic, otherwise the spectrum sweeps within a single patch and the whole
  // thing reads as airbrushed rainbow strokes instead of foil holding a colour.
  vec2 domain = vec2(dot(pUv, g0) * 0.62, dot(pUv, g1) * 1.28);

  float pitchNoise =
    noise(pUv * 7.5) * 0.58 + noise(pUv * 17.0 + 4.1) * 0.28 + noise(pUv * 44.0 + 9.3) * 0.14;
  float pitch = uPeriod * (1.0 + uPeriodVar * (pitchNoise - 0.5) * 2.0);

  float x0 = abs(dot(hp, g0));
  float x1 = abs(dot(hp, g1));

  vec3 spectrum = vec3(0.0);
  float energy = 0.0;

  // First order dominates by a wide margin. Higher orders are physically there
  // but faint, and giving them real weight superimposes red on violet — which
  // resolves to magenta, a colour no single grating can produce.
  const vec3 ORDER_WEIGHT = vec3(1.0, 0.16, 0.06);
  for (int m = 1; m <= 3; m++) {
    float fm = float(m);
    float um = pitch * x0 / fm + uLambdaShift;
    float vis = visible(um);
    if (vis < 0.001) continue;
    float w = vis * ORDER_WEIGHT[m - 1];
    spectrum += spectral(um * 1000.0) * w;
    energy += w;
  }

  // A weak crossed grating: enough to occasionally throw a second colour into a
  // patch, not enough to average the first one away.
  float umCross = pitch * 0.86 * x1 + uLambdaShift;
  float visCross = visible(umCross);
  if (visCross > 0.001) {
    float w = visCross * 0.13;
    spectrum += spectral(umCross * 1000.0) * w;
    energy += w;
  }

  // Hue from the grating, intensity from the energy. Normalising here is what
  // keeps the colour vivid: summed orders otherwise average towards white and
  // the whole film goes pastel.
  //
  // A weak sum must not be normalised into a colour, and must not be allowed to
  // contribute at all — a near-black spectrum stretched to unit peak is how a
  // dark halo appears at the edge of a hotspot.
  float peak = max(max(spectrum.r, spectrum.g), spectrum.b);
  energy *= smoothstep(0.02, 0.07, peak);

  if (peak > 1e-3) {
    spectrum /= peak;

    // The film's bias shapes the hue and nothing else. Applied after the pedestal
    // below it would tint that too, and every fragment with any diffraction at all
    // would come out warm or cool — the film reads as uniformly coloured rather
    // than as silver that catches a warm or cool spectrum. Renormalising after
    // the bias keeps it from changing brightness either.
    spectrum *= uSpectralBias;
    spectrum /= max(max(max(spectrum.r, spectrum.g), spectrum.b), 1e-3);
    spectrum = mix(vec3(dot(spectrum, vec3(0.3333))), spectrum, uSaturation);

    // Foil is never a pure spectral primary: the grating is imperfect and there is
    // always white specular underneath. This pedestal is what separates bright
    // metal catching colour from a neon overlay.
    spectrum = mix(vec3(1.0), spectrum, 0.92);
  } else {
    spectrum = vec3(1.0);
  }

  // Only part of the film is ever in a diffracting orientation. Two scales of
  // patchiness — broad regions, then finer structure inside them — pushed for
  // contrast, because averaging two fbms narrows the distribution and would
  // otherwise leave the whole surface hovering around the threshold.
  float patches =
    fbm3(domain * uPatternScale) * 0.66 +
    fbm3(domain * uPatternScale * 3.3 + 9.0) * 0.26 +
    fbm3(domain * uPatternScale * 11.0 + 31.0) * 0.08;
  patches = clamp((patches - 0.5) * 3.0 + 0.5, 0.0, 1.0);
  float lo = 0.72 - uCoverage * 0.76;
  float gate = smoothstep(lo, lo + 0.26, patches);
  // No light, no diffraction. Tying colour to the illuminated regions is what
  // makes the rainbow travel with the reflection rather than sit on the artwork.
  gate *= 0.22 + 0.78 * smoothstep(0.10, 0.58, envLuma);

  // Squared, then overdriven. The square suppresses the broad low tail — which
  // would otherwise lay a pale wash of colour across the whole sticker — while the
  // gain lets the places where the gate and the grating actually agree saturate
  // completely. Concentration is the point, not average intensity.
  float agree = energy * gate;
  float diffraction = clamp(agree * agree * uHolo * 56.0, 0.0, 1.0);
  // One more push away from the middle. Partial diffraction over bright metal is
  // what reads as washed-out pastel, so the mid range is thinned out in favour of
  // committed colour and committed silver.
  diffraction = smoothstep(0.04, 0.97, diffraction);
  // Diffracted light is redirected, not added: where the grating throws colour
  // at the eye it stops throwing white, so the silver has to give way.
  vec3 foil = mix(
    metal,
    metal * 0.14 + spectrum * min(1.25, 0.55 + envLuma * 0.80),
    diffraction
  );

  // --- gloss ---
  // A broad lobe rather than a pinpoint. A flat sticker reflects the shape of the
  // source, and the source here is a softbox.
  float specular = ggx(n, h, t, b, uRoughness * 1.7 + 0.10, uAniso) * lit;
  foil += vec3(1.0, 0.998, 0.99) * specular * uShine * 0.22;

  // Print edge: the white overprint sits a hair above the exposed foil.
  float ink = (1.0 - smoothstep(0.0, 2.0, -d)) * step(0.5, uBorderMode);
  foil *= 1.0 - ink * 0.12;

  // --- border ---
  vec3 color = foil;
  if (uBorderMode > 0.5 && inBorder > 0.001) {
    vec3 borderColor;
    if (uBorderMode < 1.5) {
      // White vinyl: diffuse stock with the faintest sheen, plus the same bevel
      // highlight so it belongs to the same physical object.
      vec3 stock = vec3(0.82, 0.818, 0.800);
      borderColor = stock * (0.84 + envLuma * 0.13);
      borderColor += vec3(1.0) * specular * uShine * 0.035;
    } else if (uBorderMode < 2.5) {
      borderColor = metal * 0.97 + vec3(1.0) * specular * uShine * 0.16;
    } else {
      borderColor = foil;
    }
    color = mix(color, borderColor, inBorder);
  }

  color = shoulder(color);

  // Hold-to-compare with the upload.
  if (uOriginal > 0.001) {
    vec3 original = srgbToLinear(art.rgb);
    color = mix(color, original, uOriginal * art.a);
    alpha = mix(alpha, art.a, uOriginal);
  }

  fragColor = vec4(linearToSrgb(color), alpha * uOpacity);
}
