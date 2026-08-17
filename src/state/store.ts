import { create } from 'zustand'
import type { Artwork } from '../lib/artwork'
import { processFile, processSource } from '../lib/artwork'
import { drawDemoArtwork } from '../lib/demoArtwork'

/**
 * Only values a human changes live here. Rotation, light position and time are
 * held in refs inside the scene and written straight to uniforms — they change
 * every frame and must never touch React.
 */

export type BorderMaterial = 'none' | 'white' | 'silver' | 'holo'

export interface Background {
  id: string
  name: string
  /** Page and canvas colour. `null` is the checkerboard. */
  color: string | null
  /** Interface ink for this background. */
  dark: boolean
}

export const BACKGROUNDS: Background[] = [
  { id: 'bone', name: 'Off white', color: '#F1F0EC', dark: false },
  { id: 'white', name: 'White', color: '#FFFFFF', dark: false },
  { id: 'grey', name: 'Grey', color: '#C9C9C4', dark: false },
  { id: 'black', name: 'Black', color: '#121211', dark: true },
  { id: 'none', name: 'Transparent', color: null, dark: false },
]

export interface Settings {
  material: string
  holo: number
  shine: number
  texture: number
  /** Die-cut width in interface units, 0–40. */
  border: number
  borderMaterial: BorderMaterial
  background: string
  auto: boolean
  /** Advanced. */
  spectrum: number
  depth: number
  shadow: number
}

export const DEFAULTS: Settings = {
  material: 'classic',
  holo: 0.62,
  shine: 0.6,
  texture: 0.4,
  border: 7,
  borderMaterial: 'white',
  background: 'bone',
  auto: false,
  spectrum: 0.5,
  depth: 0.42,
  shadow: 0.55,
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
  advancedOpen: boolean

  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  setExport: (patch: Partial<ExportSettings>) => void
  setAdvancedOpen: (open: boolean) => void
  setShowOriginal: (show: boolean) => void
  loadDemo: () => void
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
  advancedOpen: false,

  set: (key, value) => set({ [key]: value } as Partial<State>),
  setExport: (patch) =>
    set((s) => ({ exportSettings: { ...s.exportSettings, ...patch } })),
  setAdvancedOpen: (advancedOpen) => set({ advancedOpen }),
  setShowOriginal: (showOriginal) => set({ showOriginal }),

  loadDemo: () => {
    const artwork = processSource(drawDemoArtwork(), false, 'Demo')
    lastFile = null
    set({ artwork, isDemo: true, invert: false, error: null })
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
      set({ artwork: processSource(drawDemoArtwork(), next, 'Demo'), invert: next })
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
  reset: () => set({ ...DEFAULTS, advancedOpen: false }),

  dismissError: () => set({ error: null }),
}))

export function backgroundById(id: string): Background {
  return BACKGROUNDS.find((b) => b.id === id) ?? BACKGROUNDS[0]
}
