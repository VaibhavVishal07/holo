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
uniform float uFilmThickness;// laminate thickness in micrometres
uniform float uFilmVar;      // how much that thickness wanders across the sheet
uniform float uHue;          // turns of rotation applied to the diffracted colour

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

/**
 * Rotates a colour about the grey axis by `turns`.
 *
 * A wavelength offset would be the physical way to move the film's colour, but a
 * wavelength cannot wrap: push it far enough and the band simply leaves the
 * visible window and the sheet goes silver. Rotating the diffracted colour
 * instead keeps every band exactly where the geometry put it and only changes
 * which colour arrives there — which is what a different foil stock does — and it
 * comes back round to where it started.
 */
vec3 hueRotate(vec3 c, float turns) {
  float a = turns * TAU;
  float cs = cos(a);
  // Rodrigues about (1,1,1)/sqrt(3), so the grey axis is fixed.
  float sn = sin(a) * 0.5773502692;
  float t = (1.0 - cs) / 3.0;
  mat3 m = mat3(
    cs + t, t + sn, t - sn,
    t - sn, cs + t, t + sn,
    t + sn, t - sn, cs + t
  );
  return m * c;
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
vec2 rotate2(vec2 q, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(q.x * c - q.y * s, q.x * s + q.y * c);
}

/** A repeating row of strip lights, `spacing` apart, each `width` half-thick. */
float slats(vec2 q, float spacing, float width, float soft) {
  float d = abs(fract(q.y / spacing + 0.5) - 0.5) * spacing;
  // The falloff is never allowed to be narrower than a pixel of the reflection's
  // own gradient. Where the surface turns quickly a fixed-width line lands between
  // samples and the streak beads into a dotted trail that crawls as the object
  // moves; widening it exactly there keeps it a continuous line.
  float aa = fwidth(d) * 1.1;
  return 1.0 - smoothstep(width, width + max(soft, aa), d);
}

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
  // Deliberately a much gentler magnification than the room's body uses.
  //
  // The body wants magnifying, because that is what makes a couple of degrees of
  // tilt swing the silver across its whole range. The sources cannot afford it. A
  // sheet held face-on reflects p = (0,0) and a fully tilted one reaches about
  // 0.85 in surface terms — which at 5.2x lands past 4, so every strip and glint
  // sat outside the range the reflection can actually reach and the sticker never
  // caught a single one. At this scale the reachable disc is about 1.9 across, and
  // the sources below are placed inside it.
  vec2 p = (r.xy / max(0.30, r.z)) * 2.2;

  // Two crossed ceilings of strip lights.
  //
  // A single strip cannot do this job, and the reason is worth stating because it
  // took a debug pass to see. A flat face reflects one nearly constant direction,
  // so one source is hit or missed for the entire face at once — and the sheet's
  // own waviness moves the reflection by only a fraction of the distance between
  // sources. Every streak therefore appeared on the bevels, where the normal turns
  // through everything, and never on the faces, where it matters. A repeating
  // ceiling means whatever direction a face happens to look in, a strip is nearby,
  // and the waviness is more than enough to sweep across it. That is what makes a
  // long sinuous highlight travel over the surface as the object turns, which is
  // the single clearest signal that a print is laminated.
  // The spacing is set against how far the sheet's own waviness carries the
  // reflection, and the window is narrow. Much wider and a whole face sits inside
  // one band and blows out flat; much tighter and a dozen lines cross every face
  // and the result reads as a contour map drawn on top rather than as reflections.
  // At this pitch one or two bold streaks cross a face. They are also kept very
  // thin, so most directions stay dark: a ceiling that is more light than gap is
  // just a bright room, and then nothing on the sheet reads as a highlight at all.
  float stripA = slats(rotate2(p, 0.20), 0.400, 0.0035, 0.0090);
  float stripB = slats(rotate2(p, 1.44), 0.560, 0.0026, 0.0072);

  // Glints scattered across the reachable disc, so a tilt catches one or two at a
  // time and they arrive, travel and go out on their own.
  // Small enough to read as stars rather than blemishes: at the scale of the slat
  // spacing above, a wide glint is just another soft blob, and the four spikes that
  // make it look like a point source get lost.
  float sparks =
    glint(p - vec2(0.16, 0.88), 0.055) +
    glint(p - vec2(-0.82, 0.24), 0.045) * 0.85 +
    glint(p - vec2(0.92, -0.54), 0.065) * 0.7 +
    glint(p - vec2(-0.36, -0.92), 0.040) * 0.6;

  return vec3(1.0, 0.998, 0.99) * stripA * 2.3 +
         vec3(0.96, 0.985, 1.0) * stripB * 1.45 +
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

/**
 * Lets bright reflections approach white smoothly rather than clipping flat.
 *
 * Rolls off the *brightest channel* and scales the others with it, rather than
 * compressing each channel on its own. Per-channel compression pulls the leading
 * channel down towards the trailing ones, so every bright region quietly loses its
 * colour — which is most of why a saturated film still rendered as pastel.
 */
vec3 shoulder(vec3 c) {
  float m = max(max(c.r, c.g), c.b);
  if (m <= 0.82) return c;
  float over = m - 0.82;
  return c * ((0.82 + over / (1.0 + 2.2 * over)) / m);
}

/**
 * The same roll-off, per channel, which lets a colour move towards white.
 *
 * Both are needed, for opposite reasons. The film's own colour must keep its
 * chroma, or every bright band washes out. A specular reflection off the laminate
 * IS white and genuinely does wash out whatever is beneath it, so it has to be
 * allowed to climb channel by channel — rolling the highlights off with their
 * chroma preserved instead scales them back down into the colour and they vanish.
 */
vec3 clipToWhite(vec3 c) {
  vec3 over = max(c - 0.82, 0.0);
  return min(c, 0.82 + over / (1.0 + 2.2 * over));
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
  vec3 wave = fbmd(pUv * 2.0 + 4.7);
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
  vec2 slopeMacro = wave.yz * (0.042 + uDepth * 0.075);
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

  // --- the laminate's own interference -------------------------------------
  //
  // The grating alone cannot cover the sheet, and the reason is in its own
  // equation. Its path difference is pitch * sin(half-angle), so it vanishes
  // wherever the light sits near the eye's own axis — and on a sticker held
  // roughly face-on that is most of the surface. It left large regions sitting
  // blank chrome no matter how far the strength was pushed.
  //
  // The other half of the physics fixes it exactly. A clear laminate has real
  // thickness, and light reflecting off its top and bottom surfaces interferes
  // with a path difference of 2 n d cos(theta) — which is LARGEST head-on,
  // precisely where the grating gives up. Added together the sheet always has
  // some colour to return, and it still bands and still sweeps when it moves,
  // because both terms vary across the surface and both depend on the angle.
  //
  // This is also why real rainbow film and a soap bubble look related: the same
  // two mechanisms, in different proportion.
  float cosT = sqrt(max(0.05, 1.0 - (1.0 - ndv * ndv) / 2.1025)); // Snell, n = 1.45
  vec2 warpT = vec2(fbm2(pUv * 1.7 + 51.0), fbm2(pUv * 1.7 + 63.0)) - 0.5;
  // The slow field decides where the bands run. The small faster term only wobbles
  // their edges — enough that they read as a coated surface rather than an airbrush
  // gradient, and small enough that the colour still sweeps instead of fizzing.
  float thickField = fbm2(pUv * uFlow * 0.8 + warpT * 1.5 + 27.0)
    + 0.10 * (fbm2(pUv * uFlow * 3.6 + 71.0) - 0.5);
  float thickness = uFilmThickness * (1.0 + uFilmVar * (thickField - 0.5) * 2.0);
  // Holo is now literally how much film there is. At zero the laminate is optically
  // thin and the sheet is chrome that only flashes where the grating fires; at full
  // it is coated everywhere.
  float laminate = 2.0 * 1.45 * thickness * cosT * smoothstep(0.04, 0.88, uHolo);

  float opd = laminate + pitch * x0 + uLambdaShift;

  // Which interference orders reach the eye. Solving for the order instead of
  // summing a fixed few is what makes the coverage a guarantee rather than a
  // calibration: whatever the path difference turns out to be, these two bracket
  // the visible window, so there is always a wavelength on offer.
  //
  // The path difference is deliberately kept low enough to stay in the first few
  // orders, and that constraint is what keeps the film saturated. At high order the
  // two neighbouring orders fall close enough together that BOTH sit fully inside
  // vision at once — around order five they are 0.60um and 0.49um — so orange and
  // cyan arrive with equal weight and average to a pale cream. A thick soap film
  // genuinely does go white for this reason; a rainbow sticker must not.
  float order = max(1.0, floor(opd / 0.55 + 0.5));

  // Dispersion. The laminate bends each channel a little differently, and the
  // optical path through it is longest where the surface turns away — so the
  // separation is widest on the bevels. That coloured fringe along an edge is the
  // single most recognisable thing about a glossy holographic print.
  float spread = uDispersion * (0.20 + rimness * 1.7);
  vec3 opdC = opd * vec3(1.0 + 0.055 * spread, 1.0, 1.0 - 0.055 * spread);

  vec3 lamA = opdC / (order - 0.5);
  vec3 lamB = opdC / (order + 0.5);
  vec3 visA = vec3(visible(lamA.r), visible(lamA.g), visible(lamA.b));
  vec3 visB = vec3(visible(lamB.r), visible(lamB.g), visible(lamB.b));

  // Each order sampled per channel, so the dispersion above survives.
  vec3 sA = vec3(
    spectral(lamA.r * 1000.0).r,
    spectral(lamA.g * 1000.0).g,
    spectral(lamA.b * 1000.0).b
  );
  vec3 sB = vec3(
    spectral(lamB.r * 1000.0).r,
    spectral(lamB.g * 1000.0).g,
    spectral(lamB.b * 1000.0).b
  );

  // A weighted average of the two orders, not a sum, and squared so the handover
  // is quick. Adding them left both hues present at equal weight through every
  // transition, and the average of two hues is a step towards white — the whole
  // film came out pastel. Squaring gives each band an owner and confines the
  // blend to a narrow seam, which is also what a real film looks like.
  float wA = max(visA.r, max(visA.g, visA.b));
  float wB = max(visB.r, max(visB.g, visB.b));
  // Fourth power. Squaring was not enough once the bands were made to run closer
  // together: more bands means more handovers, and every handover that blends two
  // hues evenly is a pale seam. This narrows each seam to a line.
  wA *= wA; wA *= wA;
  wB *= wB; wB *= wB;
  vec3 spectrum = (sA * wA + sB * wB) / max(wA + wB, 1e-4);

  // How much colour this fragment has to give at all, as distinct from which
  // colour. Sharpening the hue handover above narrowed the seams between bands but
  // could not fill them: at a handover the outgoing wavelength has left vision and
  // the incoming one has barely entered, so both are weak, the silver underneath
  // showed through, and every seam read as a pale tan line across the film. The
  // curve lifts those partial values towards full while still leaving a genuinely
  // out-of-band fragment at zero — so a seam stays a change of colour rather than
  // becoming an absence of it, and bare chrome is still reachable.
  float energy = smoothstep(0.02, 0.45, max(
    max(visA.g, visB.g),
    max(max(visA.r, visB.r), max(visA.b, visB.b)) * 0.85
  ));

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

    // The dial. It sits here, on the normalised hue and before the white
    // pedestal, so it changes which colour the grating delivers without touching
    // how bright it is or how much of the sheet stays silver.
    if (uHue > 0.0005) {
      spectrum = max(hueRotate(spectrum, uHue), vec3(0.0));
      spectrum /= max(max(max(spectrum.r, spectrum.g), spectrum.b), 1e-3);
    }

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
  float breadth = 0.66 + 0.34 * fbm2(pUv * uFlow * 0.7 + 7.1);
  // No light, no diffraction. Tying colour to the illuminated regions is what
  // makes the spectrum travel with the reflection rather than sit on the artwork.
  float illuminated = 0.60 + 0.40 * smoothstep(0.04, 0.50, envLuma);

  float diffraction =
    clamp(energy * breadth * illuminated * uHolo * uCoverage * 2.9, 0.0, 1.0);

  // Diffracted light is redirected, not added: where the grating throws colour at
  // the eye it stops throwing white, so the silver has to give way.
  //
  // The level here is what decides whether this looks like an object or a glowing
  // gradient, and it has to leave room above itself. Driving the spectrum to 1.66
  // pushed it past anything displayable, so bright regions came back as white with a
  // tint; but even at 1.1 it occupied the whole top of the tone curve, and then the
  // laminate's own highlights had nowhere left to go and simply vanished into it.
  // Held here, the coloured film is mid-toned, and the streaks and glints added
  // further down are free to be the brightest things on the sticker — which on a
  // real laminated print is exactly what they are.
  vec3 foil = mix(
    metal,
    metal * 0.07 + spectrum * min(0.86, 0.40 + envLuma * 0.62),
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

  // The film's colour is rolled off here, with its chroma intact, so a bright band
  // stays a bright band instead of drifting towards white.
  color = shoulder(color);

  // Streaks and glints last, over everything and after that roll-off. These are
  // reflections off the top of the laminate: no amount of colour underneath dims
  // them, and they are the right thing to let blow out to white, because that is
  // what a highlight on a laminated sticker actually does.
  color += highlights * (0.55 + uGlass * 2.1) * (0.45 + uShine * 0.95);

  color = clipToWhite(color);

  // Hold-to-compare with the upload.
  if (uOriginal > 0.001) {
    vec3 original = srgbToLinear(art.rgb);
    color = mix(color, original, uOriginal * art.a);
    alpha = mix(alpha, art.a, uOriginal);
  }

  fragColor = vec4(linearToSrgb(color), alpha * uOpacity);
}
