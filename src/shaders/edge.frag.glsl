// The vinyl's own thickness. A second copy of the silhouette sits a hair behind
// the surface; at rest it is completely hidden, and as the sticker turns it peeks
// out along one side. That sliver is the whole trick — it is what makes the
// object read as a cut sheet of material rather than a decal painted on glass.

layout(location = 0) out vec4 fragColor;

varying vec2 vUv;

uniform sampler2D uSdf;
uniform sampler2D uArtwork;
uniform float uBorderPx;
uniform float uBorderMode;
uniform vec3 uColor;
uniform float uOpacity;

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float d = texture2D(uSdf, uv).r;
  float art = texture2D(uArtwork, uv).a;

  float border = uBorderMode < 0.5 ? 0.0 : uBorderPx;
  float aa = max(fwidth(d), 0.6);
  float alpha = max(art, 1.0 - smoothstep(border - aa, border + aa, d));
  if (alpha < 0.01) discard;

  fragColor = vec4(uColor, alpha * uOpacity);
}
