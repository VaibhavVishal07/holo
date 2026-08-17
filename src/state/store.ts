import { create } from 'zustand'
import type { Artwork } from '../lib/artwork'
import { processFile, processSource } from '../lib/artwork'
import { SHAPES, drawShape, shapeById } from '../lib/shapes'

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

  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setExport: (patch: Partial<ExportSettings>) => void
  setTab: (tab: DockTab) => void
  setShowOriginal: (show: boolean) => void
  /** Which built-in shape is on the canvas, when no upload is. */
  shape: string
  loadShape: (id: string) => void
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
  shape: SHAPES[0].id,
  invert: false,
  busy: false,
  error: null,
  showOriginal: false,
  exportSettings: { scale: 2, transparent: true },
  tab: 'film',

  set: (key, value) => set({ [key]: value } as Partial<State>),
  setExport: (patch) =>
    set((s) => ({ exportSettings: { ...s.exportSettings, ...patch } })),
  setTab: (tab) => set({ tab }),
  setShowOriginal: (showOriginal) => set({ showOriginal }),

  loadShape: (id) => {
    const shape = shapeById(id)
    const artwork = processSource(drawShape(shape), false, shape.name)
    lastFile = null
    set({ artwork, shape: id, isDemo: true, invert: false, error: null })
  },

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
      const shape = shapeById(get().shape)
      set({ artwork: processSource(drawShape(shape), next, shape.name), invert: next })
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
