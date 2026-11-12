import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type FlashMode = 'off' | 'auto' | 'on'

/** What the native camera screen shows beside the shutter. `clipEndsAt`
 * (ms since 1970, or null) drives the clip button's countdown. */
export interface NativeCameraOptions {
  showRemember?: boolean
  showClip?: boolean
  remembered?: boolean
  clipEndsAt?: number | null
}

/** Bridge to ios/App/App/NativeCameraPlugin.swift -- the native camera
 * screen (CameraViewController), only present in the native build. */
interface NativeCameraPlugin {
  /** Opens the camera over the app. Rejects with code UNAVAILABLE when
   * there's no camera to use. */
  open(options: NativeCameraOptions): Promise<void>
  update(options: NativeCameraOptions): Promise<void>
  close(): Promise<void>
  /** A photo taken: a JPEG file (file:// URL), already turned upright. */
  addListener(event: 'photo', listener: (event: { path: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'photoFailed', listener: (event: { message: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'remember' | 'clip' | 'closed', listener: () => void): Promise<PluginListenerHandle>
}

export const NativeCamera = registerPlugin<NativeCameraPlugin>('NativeCamera')
