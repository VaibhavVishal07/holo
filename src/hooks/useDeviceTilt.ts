import { useEffect, useRef } from 'react'
import type { TiltEngine } from './useTilt'

/**
 * Tipping the phone itself.
 *
 * This is the gesture the whole material was built for: you hold a piece of foil
 * up and move it until it catches the light. A finger dragging on glass is a
 * translation of that; the device's own attitude is the thing itself.
 *
 * Two details decide whether it feels right. The reading is relative to whatever
 * attitude the phone was held at when it was switched on, so lying on a desk and
 * standing at a bus stop both start from neutral. And the sensor feeds the engine's
 * pointer channel, so the same springs smooth it — raw orientation data is noisy
 * enough that binding it straight to a rotation reads as vibration.
 */

/** Degrees of device rotation that reach the full range. */
const SPAN = 24

/** Whether this device could plausibly report its own attitude. */
export function deviceTiltSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof DeviceOrientationEvent === 'undefined') return false
  // The constructor exists on desktop browsers too, where the event never fires.
  // A coarse pointer is what actually distinguishes a device you can pick up.
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * Asks for the sensor. iOS only hands out orientation after an explicit grant,
 * and only asks from inside a user gesture — which is why this is called from a
 * button's own handler rather than on load.
 */
export async function requestDeviceTilt(): Promise<boolean> {
  const request = (
    DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<PermissionState>
    }
  ).requestPermission
  if (typeof request !== 'function') return true
  try {
    return (await request()) === 'granted'
  } catch {
    return false
  }
}

/** Feeds the engine from `deviceorientation` while `enabled`. */
export function useDeviceTilt(engine: TiltEngine, enabled: boolean) {
  /** The attitude the device was held at when this was switched on. */
  const base = useRef<{ beta: number; gamma: number } | null>(null)

  useEffect(() => {
    if (!enabled) return

    base.current = null

    const onOrientation = (event: DeviceOrientationEvent) => {
      const { beta, gamma } = event
      if (beta === null || gamma === null) return
      if (!base.current) base.current = { beta, gamma }

      // Wrapped to the short way round, so a reading that crosses ±180 does not
      // send the sticker the long way about.
      const dGamma = shortest(gamma - base.current.gamma)
      const dBeta = shortest(beta - base.current.beta)

      // Tip the right edge of the phone away and the right edge of the sticker
      // goes with it; the object behaves as though it were lying behind the glass.
      engine.setOrientation(dGamma / SPAN, -dBeta / SPAN)
    }

    window.addEventListener('deviceorientation', onOrientation)
    return () => {
      window.removeEventListener('deviceorientation', onOrientation)
      engine.clearOrientation()
    }
  }, [enabled, engine])
}

function shortest(deg: number) {
  return deg - Math.round(deg / 360) * 360
}
