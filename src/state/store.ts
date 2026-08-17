import { create } from 'zustand'
import type { Artwork } from '../lib/artwork'
import { processFile, processSource } from '../lib/artwork'
import { drawDemoShape } from '../lib/demoShape'

/**
 * Only values a human changes live here. Rotation, light position and time are
 * held in refs inside the scene and written straight to uniforms — they change
 * every frame and must never touch React.
 */

export type BorderMaterial = 'none' | 'white' | 'silver' | 'holo'

/** Which group of controls the dock is showing. */
export type DockTab = 'film' | 'light' | 'cut' | 'canvas'

export interface Background {
  id: string
  name: string
  /** Page and canvas colour. `null` is the checkerboard. */
  color: string | null
  /** Interface ink for this background. */
  dark: boolean
}

export const BACKGROUNDS: Background[] = [
  { id: 'black', name: 'Black', color: '#0A0A0B', dark: true },
  { id: 'graphite', name: 'Graphite', color: '#232427', dark: true },
  { id: 'grey', name: 'Grey', color: '#C9C9C4', dark: false },
  { id: 'bone', name: 'Off white', color: '#F1F0EC', dark: false },
  { id: 'white', name: 'White', color: '#FFFFFF', dark: false },
  { id: 'none', name: 'Transparent', color: null, dark: true },
]

export interface Settings {
  holo: number
  shine: number
  /** Rotates the whole spectrum, 0 neutral through 1 for a full turn. */
  hue: number
  /** Multiplies the style's own laminate strength. */
  glass: number
  depth: number
  /** Die-cut width in interface units, 0–40. */
  border: number
  borderMaterial: BorderMaterial
  background: string
  shadow: number
  auto: boolean
  /** Light position in the studio, -1..1 on each axis. */
  lightX: number
  lightY: number
  /** How grazing the light is: 0 head-on, 1 raking across the surface. */
  lightAngle: number
  /** While true the light tracks the pointer instead of the placed position. */
  lightFollow: boolean
}

export const DEFAULTS: Settings = {
  holo: 0.85,
  shine: 0.6,
  hue: 0,
  glass: 0.55,
  depth: 0.42,
  border: 7,
  borderMaterial: 'holo',
  background: 'black',
  shadow: 0.55,
  auto: false,
  lightX: 0.34,
  lightY: 0.4,
  lightAngle: 0.62,
  lightFollow: true,
}

export interface ExportSettings {
  scale: 1 | 2 | 4
  transparent: boolean
}

interface State extends Settings {
  artwork: Artwork | null
  /** True while the demo shape is on screen and nothing has been uploaded. */
  isDemo: boolean
  invert: boolean
  busy: boolean
  error: string | null
  /** True while a hold-to-compare is active. */
  showOriginal: boolean
  exportSettings: ExportSettings
  tab: DockTab
  /**
   * Whether the device's own tilt is driving the object. A capability rather than
   * a look, so Reset leaves it alone.
   */
  deviceTilt: boolean

  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setExport: (patch: Partial<ExportSettings>) => void
  setTab: (tab: DockTab) => void
  setShowOriginal: (show: boolean) => void
  setDeviceTilt: (on: boolean) => void
  loadDemo: () => void
  /** Re-rolls the film's colour, its strength and where the light is. */
  shuffle: () => void
  loadFile: (file: File) => Promise<void>
  toggleInvert: () => Promise<void>
  reset: () => void
  dismissError: () => void
}

/** The most recent upload, kept so Invert can re-run the mask. */
let lastFile: File | null = null

export const useStore = create<State>((set, get) => ({
  ...DEFAULTS,
  artwork: null,
  isDemo: true,
  invert: false,
  busy: false,
  error: null,
  showOriginal: false,
  exportSettings: { scale: 2, transparent: true },
  tab: 'film',
  deviceTilt: false,

  set: (key, value) => set({ [key]: value } as Partial<State>),
  setExport: (patch) =>
    set((s) => ({ exportSettings: { ...s.exportSettings, ...patch } })),
  setTab: (tab) => set({ tab }),
  setShowOriginal: (showOriginal) => set({ showOriginal }),
  setDeviceTilt: (deviceTilt) => set({ deviceTilt }),

  loadDemo: () => {
    const artwork = processSource(drawDemoShape(), false, 'Sparkle')
    lastFile = null
    set({ artwork, isDemo: true, invert: false, error: null })
  },

  /**
   * One action that produces a whole new look. The ranges are deliberately
   * narrower than the sliders': every roll should land on something worth
   * looking at, or the button stops being worth pressing.
   */
  shuffle: () =>
    set({
      hue: Math.random(),
      holo: 0.7 + Math.random() * 0.3,
      shine: 0.35 + Math.random() * 0.55,
      glass: 0.3 + Math.random() * 0.65,
      // The light moves, but only within the arc that actually diffracts.
      //
      // These bounds are measured, not guessed. Sweeping the light over a grid and
      // counting coloured pixels shows a dead valley wherever it sits near the view
      // axis: the half-vector goes flat, no angle means no wavelength, and the
      // sheet is honestly silver. Off to one side and above, the same sweep holds
      // between 7% and 15% of the sheet in colour. A button whose job is to always
      // land on something has to stay inside that.
      lightX: 0.42 + Math.random() * 0.5,
      lightY: 0.18 + Math.random() * 0.75,
      lightAngle: 0.4 + Math.random() * 0.32,
      // The light just moved on purpose; letting the pointer take it back would
      // undo half the roll.
      lightFollow: false,
    }),

  loadFile: async (file) => {
    set({ busy: true, error: null })
    try {
      const artwork = await processFile(file, false)
      lastFile = file
      set({ artwork, isDemo: false, invert: false, busy: false })
    } catch (error) {
      set({
        busy: false,
        error:
          error instanceof Error && error.message
            ? error.message
            : 'That file could not be read',
      })
    }
  },

  toggleInvert: async () => {
    const { invert, isDemo, busy } = get()
    if (busy) return
    const next = !invert
    if (isDemo || !lastFile) {
      set({ artwork: processSource(drawDemoShape(), next, 'Sparkle'), invert: next })
      return
    }
    set({ busy: true })
    try {
      const artwork = await processFile(lastFile, next)
      set({ artwork, invert: next, busy: false })
    } catch {
      set({ busy: false })
    }
  },

  /** Aesthetic settings only. The artwork stays. */
  reset: () => set({ ...DEFAULTS }),

  dismissError: () => set({ error: null }),
}))

export function backgroundById(id: string): Background {
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0]
}
