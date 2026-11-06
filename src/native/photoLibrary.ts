import { registerPlugin } from '@capacitor/core'

/** Bridge to ios/App/App/PhotoLibraryPlugin.swift -- only present in the native build. */
interface PhotoLibraryPlugin {
  /** Rejects with code 'denied' if Photos access is off. */
  save(options: { data: string }): Promise<void>
}

export const PHOTOS_DENIED_MESSAGE = 'Turn on Photos access in Settings to save'

const PhotoLibrary = registerPlugin<PhotoLibraryPlugin>('PhotoLibrary')

/** Saves the image at `url` (a blob: or data: URL) to the iPhone's photo album. */
export async function saveToPhotoLibrary(url: string): Promise<void> {
  const blob = await (await fetch(url)).blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  await PhotoLibrary.save({ data: dataUrl.slice(dataUrl.indexOf(',') + 1) })
}
