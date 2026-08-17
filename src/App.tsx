import { useCallback, useEffect, useRef, useState } from 'react'
import { Stage } from './components/Stage'
import { Dock } from './components/Dock'
import { ExportPanel } from './components/ExportPanel'
import { ACCEPTED_TYPES } from './lib/artwork'
import { DEFAULTS, backgroundById, useStore } from './state/store'
import './styles/global.css'

export default function App() {
  const store = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [dropping, setDropping] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    const s = useStore.getState()
    if (!s.artwork) s.loadDemo()
  }, [])

  // The whole interface takes the canvas colour, because the page is the canvas.
  const background = backgroundById(store.background)
  useEffect(() => {
    document.documentElement.dataset.theme = background.dark ? 'dark' : 'light'
    document.body.style.background = background.color ?? ''
  }, [background])

  const pick = useCallback(() => input.current?.click(), [])

  const onFiles = useCallback((files: FileList | null) => {
    const file = files?.[0]
    if (file) void useStore.getState().loadFile(file)
  }, [])

  const settingsChanged = (Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]).some(
    (key) => store[key] !== DEFAULTS[key],
  )

  return (
    <div
      className={`app${dropping ? ' dropping' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        dragDepth.current += 1
        setDropping(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current -= 1
        if (dragDepth.current <= 0) setDropping(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setDropping(false)
        onFiles(event.dataTransfer.files)
      }}
    >
      <header className="header">
        <h1 className="wordmark">HOLO</h1>
        <div className="header-actions">
          {!store.isDemo && (
            <button type="button" className="action" onClick={pick}>
              Replace
            </button>
          )}
          {settingsChanged && (
            <button
              type="button"
              className="action"
              data-quiet="true"
              onClick={store.reset}
            >
              Reset
            </button>
          )}
          <ExportPanel />
        </div>
      </header>

      <Stage onUpload={pick} />
      <Dock />

      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES}
        className="visually-hidden"
        onChange={(event) => {
          onFiles(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}
