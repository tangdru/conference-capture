import { registerPlugin } from '@capacitor/core'

/** Bridge to ios/App/App/SlideScannerPlugin.swift -- only present in the native build. */
interface SlideScannerPlugin {
  /** Flattens the slide in a photo if there is one and reads its text, on-device. */
  process(options: { data: string }): Promise<{ text: string; straightened: boolean; data?: string }>
}

export const SlideScanner = registerPlugin<SlideScannerPlugin>('SlideScanner')

/** A blob as bare base64 (no data: prefix), for passing over the bridge. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
