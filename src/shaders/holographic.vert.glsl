// Carries a world-space tangent frame to the fragment stage. The frame is what
// physically ties the foil to the object: when the sticker rotates, T/B/N rotate
// with it, so the half-vector the diffraction reads is genuinely the one the
// tilted surface sees. Nothing about the pattern is animated in screen space.
//
// The sticker is an extruded solid, so the normal is the mesh's own and UVs are
// derived from position rather than an attribute — which gives the side walls the
// UV of the contour they stand on, exactly where they meet the face.

uniform vec2 uPlaneSize;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vTangent;
varying vec3 vBitangent;
/** 1 on the flat faces, 0 on the cut edge, between the two across the bevel. */
varying float vFace;

void main() {
  vUv = position.xy / uPlaneSize + 0.5;
  vFace = abs(normalize(normal).z);

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;

  mat3 model = mat3(modelMatrix);
  // The foil pattern stays keyed to the artwork's own axes, so the tangent frame
  // comes from the object rather than from the triangle.
  vTangent = normalize(model * vec3(1.0, 0.0, 0.0));
  vBitangent = normalize(model * vec3(0.0, 1.0, 0.0));
  vNormal = normalize(normalMatrix * normal);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
