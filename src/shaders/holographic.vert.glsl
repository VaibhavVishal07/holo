// Carries a world-space tangent frame to the fragment stage. The frame is what
// physically ties the foil to the object: when the sticker rotates, T/B/N rotate
// with it, so the half-vector the diffraction reads is genuinely the one the
// tilted surface sees. Nothing about the pattern is animated in screen space.

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vBitangent;

void main() {
  vUv = uv;

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;

  mat3 model = mat3(modelMatrix);
  vTangent = normalize(model * vec3(1.0, 0.0, 0.0));
  vBitangent = normalize(model * vec3(0.0, 1.0, 0.0));
  vNormal = normalize(model * vec3(0.0, 0.0, 1.0));

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
