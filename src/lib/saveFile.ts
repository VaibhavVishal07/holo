/**
 * Handing a finished file to the person using the tool.
 *
 * An anchor with `download` is all this normally needs. But some hosts sandbox
 * the page and refuse page-initiated downloads outright — an embedded preview,
 * for instance — where that anchor silently does nothing and the export looks
 * broken. Such a host can install its own sink instead, and both export paths
 * stay identical on either side of it.
 */

export type FileSink = (blob: Blob, filename: string) => Promise<void>

declare global {
  interface Window {
    holoFileSink?: FileSink
  }
}

export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const sink = window.holoFileSink
  if (sink) {
    await sink(blob, filename)
    return
  }

  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.rel = 'noopener'
    link.click()
  } finally {
    // Give the click a tick to be picked up before the URL goes away.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function exportFilename(label: string, extension: string): string {
  const stem = label.replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9-_]+/gi, '-')
  return `${stem || 'holo'}-holo.${extension}`
}
