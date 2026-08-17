import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The checkerboard behind a transparent canvas.
 *
 * Drawn in GL rather than CSS so the WebGL surface can stay opaque. That keeps
 * alpha out of the browser compositor entirely, which is what lets the material
 * blend correctly on screen and still read back cleanly for a transparent PNG.
 */
const FRAGMENT = /* glsl */ `
layout(location = 0) out vec4 fragColor;

uniform vec3 uLight;
uniform vec3 uDark;
uniform float uSize;

void main() {
  vec2 cell = floor(gl_FragCoord.xy / uSize);
  float checker = mod(cell.x + cell.y, 2.0);
  fragColor = vec4(mix(uLight, uDark, checker), 1.0);
}
`

const VERTEX = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export function Backdrop() {
  const viewport = useThree((s) => s.viewport)
  const dpr = useThree((s) => s.viewport.dpr)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        glslVersion: THREE.GLSL3,
        depthWrite: false,
        uniforms: {
          uLight: { value: new THREE.Color('#ffffff') },
          uDark: { value: new THREE.Color('#eceae4') },
          uSize: { value: 11 },
        },
      }),
    [],
  )

  material.uniforms.uSize.value = 11 * dpr

  return (
    <mesh
      material={material}
      renderOrder={-1}
      position={[0, 0, -1.2]}
      frustumCulled={false}
    >
      <planeGeometry args={[viewport.width * 2.4, viewport.height * 2.4]} />
    </mesh>
  )
}
