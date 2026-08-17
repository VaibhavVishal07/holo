// Contact shadow. A distance field is already a blur: reading the die-cut
// contour at a wide, soft threshold gives a correctly shaped penumbra for the
// cost of one texture fetch, and it follows the border width for free.
//
// The silhouette is skewed slightly by the current tilt so the shadow leans the
// way the object leans, without needing a second render pass.

layout(location = 0) out vec4 fragColor;

varying vec2 vUv;

uniform sampler2D uSdf;
uniform float uBorderPx;
uniform float uBorderMode;
uniform float uSpread;
uniform float uOpacity;
uniform vec2 uSkew;
uniform vec3 uColor;

void main() {
  vec2 uv = vUv + uSkew * (vUv - 0.5);
  float d = texture2D(uSdf, vec2(uv.x, 1.0 - uv.y)).r;

  float border = uBorderMode < 0.5 ? 0.0 : uBorderPx;
  float a = 1.0 - smoothstep(border - uSpread * 0.3, border + uSpread, d);
  a = pow(clamp(a, 0.0, 1.0), 1.45);
  if (a < 0.004) discard;

  fragColor = vec4(uColor, a * uOpacity);
}
