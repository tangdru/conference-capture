import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/** Bridge to ios/App/App/PhotoUploadsPlugin.swift -- only present in the native build. */
interface PhotoUploadsPlugin {
  setAuth(options: { token: string; apikey: string; storageUrl: string; restUrl: string }): Promise<void>
  /** Saves, straightens and reads the photo, then queues its upload. `data`
   * in the result is the flattened slide, if one was found. */
  enqueue(options: {
    id: string
    sessionId: string
    /** The photo as base64, or as a file:// URL (from the native camera). */
    data?: string
    filePath?: string
    originalPath: string
    flattenedPath: string
    row: Record<string, unknown>
  }): Promise<{ text: string; data?: string }>
  pending(): Promise<{ items: { id: string; sessionId: string; row: Record<string, unknown>; data: string }[] }>
  cancel(options: { id?: string; sessionId?: string }): Promise<void>
  addListener(event: 'uploaded', listener: (event: { id: string }) => void): Promise<PluginListenerHandle>
}

export const PhotoUploads = registerPlugin<PhotoUploadsPlugin>('PhotoUploads')
