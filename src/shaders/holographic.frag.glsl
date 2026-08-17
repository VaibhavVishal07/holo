// ---------------------------------------------------------------------------
// Holographic silver vinyl.
//
// The material is silver first. Colour is not painted on; it is what happens
// when a diffraction grating happens to be oriented such that a visible
// wavelength reflects from the light towards the eye. Everywhere else the
// surface keeps reflecting the room, which is why most of it stays chrome.
//
// The film is COHERENT. On real rainbow foil the spectrum sweeps across the
// whole piece in broad continuous bands — pink into peach into mint into lilac —
// and slides into mirror silver where the angle stops diffracting. It does not
// break into patches with edges. So every field that feeds the wavelength here
// is deliberately low frequency: a stepped or high-frequency field makes colour
// jump between neighbouring pixels as the object turns, which reads as a broken
// effect rather than a material.
//
// Per fragment:
//   1. read the signed distance field, resolve artwork / border / outside
//   2. build two normals: the sheet's shape, and the finer roughness on top
//   3. reflect the room into it -> the metal
//   4. solve the grating equation against the half-vector -> the spectrum
//   5. add the gloss -> the wet sheen
// ---------------------------------------------------------------------------

layout(location = 0) out vec4 fragColor;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vBitangent;
/** 1 on the flat faces, 0 on the cut edge, between the two across the bevel. */
varying float vFace;

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
/**
 * 1 when the mesh is a plane and the silhouette has to come from the mask; 0 when
 * the mesh is the extruded solid and already *is* the silhouette.
 */
uniform float uTrim;

// Material, driven by the presets and the sliders.
uniform vec3 uBase;          // silver body tint
uniform vec3 uEnvLow;        // the floor of the room
uniform vec3 uEnvHigh;       // the ceiling of the room
uniform vec3 uSpectralBias;  // per-channel weighting of the spectrum
uniform float uKey;
uniform float uFill;
uniform float uHolo;         // diffraction strength
uniform float uShine;        // gloss strength
uniform float uTexture;      // grain + brushing amount
uniform float uSaturation;
uniform float uPearl;        // how much white sits under the spectrum
uniform float uGlass;        // strength of the clear laminate over the foil
uniform float uDispersion;   // how far the channels separate at the bevel
uniform float uSparkle;      // strength of the studio's glints
uniform float uPeriod;       // grating pitch, micrometres
uniform float uPeriodVar;
uniform float uFlow;         // how many band sweeps cross the artwork
uniform float uSwirl;        // how far the grating orientation drifts
uniform float uCoverage;     // overall strength of the film
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
 * Smooth two-octave field. Everything that decides a wavelength uses this and
 * nothing finer — a third octave is already enough to make the bands grainy.
 */
float fbm2(vec2 p) {
  return noise(p) * 0.68 + noise(p * 2.13 + 4.7) * 0.32;
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
 * Rolls the spectrum off at both ends of vision instead of clipping it. The
 * long ramps matter: this rolloff IS the transition from colour into mirror
 * silver, and it should take a broad sweep of the surface to complete.
 *
 * The window is kept strictly inside `spectral`'s 400–700nm domain. If it
 * reaches past either end there is a band of wavelengths where the diffraction
 * has energy but the fit returns near-black, and that paints a grey rim around
 * every region of colour.
 */
float visible(float um) {
  return smoothstep(0.398, 0.452, um) * (1.0 - smoothstep(0.632, 0.698, um));
}

// --- the room ---------------------------------------------------------------

float softRect(vec2 p, vec2 halfSize, float soft) {
  vec2 q = abs(p) - halfSize;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return 1.0 - smoothstep(-soft * 0.55, soft, d);
}

/**
 * A small bright source with four diffraction spikes — a glint.
 *
 * This lives in the studio rather than being drawn onto the surface, so when the
 * sheet turns and its reflection sweeps across one, the star appears, travels and
 * goes out on its own. Painting stars onto the artwork instead would leave them
 * stuck to it, which is the tell of a decorative overlay.
 */
float glint(vec2 q, float size) {
  float r = length(q) / size;
  float core = exp(-r * r * 2.2);
  float across = exp(-abs(q.y) / (size * 0.14)) * exp(-abs(q.x) / (size * 4.5));
  float down = exp(-abs(q.x) / (size * 0.14)) * exp(-abs(q.y) / (size * 4.5));
  return core + (across + down) * 0.62;
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
  // Magnified hard, because a nearly flat sheet only ever reflects a narrow cone.
  // Widening what that cone maps to is what gives the chrome its range: near-black
  // in one region and blown white in another, a few degrees apart.
  vec2 p = (r.xy / max(0.30, r.z)) * 5.2;

  vec3 c = mix(uEnvLow, uEnvHigh, smoothstep(-0.95, 0.36, p.y));

  float key = softRect(p - vec2(-0.10, 0.62), vec2(0.85, 0.50), 0.40);
  float fill = softRect(p - vec2(1.15, 0.02), vec2(0.24, 0.60), 0.34);
  float occluder = softRect(p - vec2(-0.50, -1.00), vec2(0.95, 0.70), 0.80);

  c += vec3(1.0, 0.995, 0.982) * key * uKey * 0.46;
  c += vec3(0.88, 0.94, 1.0) * fill * uFill * 0.60;

  c *= 1.0 - occluder * 0.30;

  return c;
}

/**
 * The studio's *specular* sources, kept separate from its body on purpose.
 *
 * Diffraction redirects the body: where the grating throws colour at the eye it
 * stops throwing white, so the body has to give way. A highlight off the laminate
 * is a different layer entirely — it reflects before the light ever reaches the
 * film, so it does not care what colour is underneath. Folding these into the body
 * meant the strongest colour erased every streak and glint on the sticker, which
 * is exactly backwards: on real prints the two sit on top of one another.
 */
vec3 roomHighlights(vec3 r) {
  vec2 p = (r.xy / max(0.30, r.z)) * 5.2;

  // Two narrow strip lights. Reflected off a surface that is never perfectly
  // flat, a thin bright source becomes a long sinuous highlight that travels as
  // the object turns — that streak is what reads as a wet laminate, and a broad
  // softbox cannot produce it however bright it gets.
  float stripA = softRect(p - vec2(0.10, 0.40), vec2(2.30, 0.055), 0.09);
  float stripB = softRect(p - vec2(-0.62, -0.14), vec2(0.045, 1.80), 0.075);

  // Three glints, scattered so a tilt only ever catches one or two.
  float sparks =
    glint(p - vec2(0.52, 0.76), 0.115) +
    glint(p - vec2(-0.86, 0.30), 0.085) * 0.8 +
    glint(p - vec2(0.16, -0.70), 0.095) * 0.65;

  return vec3(1.0, 0.998, 0.99) * stripA * 2.1 +
         vec3(0.96, 0.985, 1.0) * stripB * 1.0 +
         vec3(1.0) * sparks * uSparkle * 3.4;
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
  vec3 over = max(c - 0.68, 0.0);
  return min(c, 0.68 + over / (1.0 + 4.2 * over));
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

  vec4 art = texture2D(uArtwork, vec2(vUv.x, 1.0 - vUv.y));
  float aa = max(fwidth(d), 0.6);
  float cutAlpha = 1.0 - smoothstep(border - aa, border + aa, d);

  // The extruded solid carries its own silhouette, so the field is only asked
  // which material a point is: exposed foil, or the white overprint around it.
  // That inner boundary stays perfectly crisp because it is still analytic.
  float alpha = mix(1.0, max(art.a, cutAlpha), uTrim);
  if (alpha < 0.002) discard;

  float inBorder = clamp(cutAlpha - art.a, 0.0, 1.0);

  // --- surface ---
  vec3 n = normalize(vNormal);
  vec3 t = normalize(vTangent);
  vec3 b = normalize(vBitangent);

  vec2 pUv = vUv * uPatternAspect;

  // Vinyl is never dead flat. This large, slow waviness is the single biggest
  // reason the specular sweep looks handmade rather than computed — and being
  // slow is the point, since it also bends the wavelength field.
  vec3 wave = fbmd(pUv * 1.9 + 4.7);
  // Micro-roughness. This is finer than the grating, so it scatters the gloss
  // but must not reach the wavelength — feeding it into the diffraction is what
  // made the colour fizz from pixel to pixel.
  vec3 facet = fbmd(pUv * 24.0 + 21.3);
  // Brushing runs along X, so the height varies across Y.
  float brush = noise(vec2(pUv.x * 46.0, pUv.y * 380.0)) - 0.5;
  float grain = noise(pUv * 640.0) - 0.5;
  // Both are fine enough to alias once a cell falls below a pixel; fade them out
  // exactly where that starts rather than letting the surface fizz.
  grain *= 1.0 - smoothstep(0.30, 0.85, fwidth(pUv.x) * 640.0);
  brush *= 1.0 - smoothstep(0.30, 0.85, fwidth(pUv.y) * 380.0);

  // Two normals: the shape of the sheet, and the roughness sitting on it.
  vec2 slopeMacro = wave.yz * (0.030 + uDepth * 0.050);
  vec2 slopeMicro =
    facet.yz * uFacet * 0.0022 +
    vec2(grain * 0.6, grain) * uTexture * 0.007 +
    vec2(0.0, brush) * uTexture * 0.005;

  vec3 nMacro = normalize(n + t * slopeMacro.x + b * slopeMacro.y);
  n = normalize(nMacro + t * slopeMicro.x + b * slopeMicro.y);

  // How flat this fragment's face is: 1 across the sheet, 0 on the cut edge.
  // `flat` is a reserved interpolation qualifier, hence the name.
  float faceness = smoothstep(0.26, 0.72, vFace);
  float rimness = 1.0 - faceness;

  vec3 v = normalize(uCamera - vWorldPos);
  vec3 l = normalize(uLight - vWorldPos);
  vec3 h = normalize(v + l);

  float ndv = max(dot(n, v), 0.0);
  float lit = smoothstep(-0.05, 0.35, dot(n, l));

  // --- the metal ---
  vec3 env = room(reflect(-v, n));
  float envLuma = dot(env, vec3(0.2126, 0.7152, 0.0722));

  // The laminate is smoother than the film under it, so it gets its own normal
  // with most of the micro-roughness taken back out.
  vec3 coatNormal = normalize(nMacro + t * slopeMicro.x * 0.2 + b * slopeMicro.y * 0.2);
  vec3 highlights = roomHighlights(reflect(-v, coatNormal));

  // Restrained Fresnel: silver is already reflective everywhere, so this only
  // has to lift the grazing edges a little.
  float fresnel = pow(1.0 - ndv, 4.5);
  vec3 metal = env * uBase * (1.0 + fresnel * 0.5);

  // Gloss is mostly the reflected sources, not a point highlight. On a sheet this
  // flat, under a light this far off axis, a tight lobe never fires — so Shine has
  // to act on the part of the reflection that is actually the light: the bright
  // excess where the softbox lands. Low Shine reads satin, high Shine takes that
  // reflection to near-white.
  float sources = max(0.0, envLuma - 0.70);
  metal *= 1.0 + sources * (uShine - 0.30) * 1.15;

  // --- diffraction ---
  // The grating lives in the plane of the film, so the half-vector is resolved in
  // the frame of the sheet's own surface. This is the join that makes the effect
  // physical: rotate the sticker, the frame rotates with it, and the wavelength
  // that reaches the eye changes because the geometry changed.
  vec3 tl = normalize(t - nMacro * dot(nMacro, t));
  vec3 bl = cross(nMacro, tl);
  // In-plane length of the half-vector is the sine of the half angle, which is
  // exactly the term the grating equation needs.
  vec2 hp = vec2(dot(h, tl), dot(h, bl));

  // Grating orientation drifts, continuously and slowly. An earlier version
  // quantised this into domains, which gave every region a crisp edge and made
  // the colour step rather than sweep as the object moved.
  vec2 warpSeed = vec2(fbm2(pUv * 1.1 + 31.0), fbm2(pUv * 1.1 + 41.0)) - 0.5;
  float angle = (fbm2(pUv * uFlow * 0.5 + warpSeed) - 0.5) * TAU * uSwirl;
  vec2 g0 = vec2(cos(angle), sin(angle));

  // Pitch varies at the same low frequency. `uFlow` is literally how many band
  // sweeps cross the artwork.
  //
  // The field is domain-warped first. Plain low-frequency noise has iso-contours
  // that run close to straight across a single cell, so the spectrum came out as
  // parallel stripes; warping the lookup makes the bands curl and wrap the way
  // they do on real film.
  vec2 warp = vec2(fbm2(pUv * 1.3 + 11.0), fbm2(pUv * 1.3 + 19.0)) - 0.5;
  float pitchField = fbm2(pUv * uFlow + warp * 1.6 + 3.3);
  float pitch = uPeriod * (1.0 + uPeriodVar * (pitchField - 0.5) * 2.0);

  float x0 = abs(dot(hp, g0));

  float um = pitch * x0 + uLambdaShift;

  // Dispersion. The laminate bends each channel a little differently, and the
  // optical path through it is longest where the surface turns away — so the
  // separation is widest on the bevels. That coloured fringe along an edge is the
  // single most recognisable thing about a glossy holographic print.
  float spread = uDispersion * (0.20 + rimness * 1.7);
  float umR = um * (1.0 + 0.055 * spread);
  float umB = um * (1.0 - 0.055 * spread);
  float visR = visible(umR);
  float vis = visible(um);
  float visB = visible(umB);
  vec3 spectrum = vec3(
    spectral(umR * 1000.0).r * visR,
    spectral(um * 1000.0).g * vis,
    spectral(umB * 1000.0).b * visB
  );
  float energy = max(vis, max(visR, visB) * 0.85);

  // Second order, faint. It only reaches the visible band at strong angles, where
  // it lays a narrow secondary band beside the first.
  float umSecond = pitch * x0 * 0.5 + uLambdaShift;
  float visSecond = visible(umSecond) * 0.30;
  spectrum += spectral(umSecond * 1000.0) * visSecond;
  energy += visSecond;

  // Hue from the grating, intensity from the energy. Normalising keeps the colour
  // from washing out where two orders overlap. A weak sum must not be normalised
  // into a colour at all — a near-black spectrum stretched to unit peak is how a
  // dark rim appears at the edge of a band.
  float peak = max(max(spectrum.r, spectrum.g), spectrum.b);
  energy *= smoothstep(0.02, 0.09, peak);

  if (peak > 1e-3) {
    spectrum /= peak;

    // The film's bias shapes the hue and nothing else. Applied after the pearl
    // pedestal below it would tint that too, and every fragment with any
    // diffraction at all would come out warm or cool — the film reads as
    // uniformly coloured rather than as silver that catches a warm or cool
    // spectrum. Renormalising after keeps it from changing brightness either.
    spectrum *= uSpectralBias;
    spectrum /= max(max(max(spectrum.r, spectrum.g), spectrum.b), 1e-3);
    spectrum = mix(vec3(dot(spectrum, vec3(0.3333))), spectrum, uSaturation);

    // Pearl: foil is never a pure spectral primary. There is always white
    // specular under the grating, and how much decides whether the film reads as
    // soft pastel stationery or as saturated rainbow chrome.
    spectrum = mix(vec3(1.0), spectrum, 1.0 - uPearl);
  } else {
    spectrum = vec3(1.0);
  }

  // How strongly the film diffracts, varying broadly and smoothly across the
  // sheet. Smooth on purpose: a threshold here is what turns continuous bands
  // into patches with edges.
  float breadth = 0.45 + 0.55 * fbm2(pUv * uFlow * 0.7 + 7.1);
  // No light, no diffraction. Tying colour to the illuminated regions is what
  // makes the spectrum travel with the reflection rather than sit on the artwork.
  float illuminated = 0.42 + 0.58 * smoothstep(0.06, 0.56, envLuma);

  float diffraction =
    clamp(energy * breadth * illuminated * uHolo * uCoverage * 2.45, 0.0, 1.0);

  // Diffracted light is redirected, not added: where the grating throws colour
  // at the eye it stops throwing white, so the silver has to give way.
  vec3 foil = mix(
    metal,
    metal * 0.10 + spectrum * min(1.48, 0.56 + envLuma * 0.98),
    diffraction
  );

  // --- gloss ---
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

  // The cut edge of the sheet. The mesh's own normals point outward here, so the
  // studio is sampled at a grazing angle and the rim picks up its own highlight —
  // which is what makes the thickness read rather than look like an outline.
  vec3 cutEdge = metal * 0.46 * (0.60 + envLuma * 0.90);
  cutEdge += vec3(1.0) * specular * uShine * 0.10;
  cutEdge = mix(cutEdge, foil * 0.5, 0.22);
  color = mix(cutEdge, color, faceness);

  // --- clear coat ---
  // A laminate sits over the foil, and it is a separate optical layer with its own
  // Fresnel. Without it the surface reads as bare film; with it, as something
  // printed and laminated — the wet look on a real sticker.
  float coatFresnel = 0.05 + 0.95 * pow(1.0 - max(dot(coatNormal, v), 0.0), 5.0);
  float coat = uGlass * (0.16 + coatFresnel * 0.84);
  // The coat reflects some light away before it ever reaches the foil.
  color *= 1.0 - coat * 0.20;
  color += room(reflect(-v, coatNormal)) * coat * 0.26;

  // Streaks and glints last, over everything. These are reflections off the top
  // of the laminate, so no amount of colour underneath dims them.
  color += highlights * (0.45 + uGlass * 1.9) * (0.45 + uShine * 0.9);

  color = shoulder(color);

  // Hold-to-compare with the upload.
  if (uOriginal > 0.001) {
    vec3 original = srgbToLinear(art.rgb);
    color = mix(color, original, uOriginal * art.a);
    alpha = mix(alpha, art.a, uOriginal);
  }

  fragColor = vec4(linearToSrgb(color), alpha * uOpacity);
}
