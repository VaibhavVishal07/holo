import type * as THREE from 'three'

/**
 * A direct line into the render loop for the exporter, which needs the live
 * scene at its current orientation and cannot get it through React state
 * without being a frame or two behind.
 */
export interface SceneHandle {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** The group carrying the current tilt. */
  tilt: THREE.Object3D
  /** Un-rotated parent, carrying the fit scale. */
  root: THREE.Object3D
  shadow: THREE.Object3D
  /** Sticker plane size in world units, before the root scale. */
  planeWidth: number
  planeHeight: number
}

export const sceneHandle: { current: SceneHandle | null } = { current: null }
