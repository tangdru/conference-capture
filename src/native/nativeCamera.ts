import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type FlashMode = 'off' | 'auto' | 'on'

/** What the native camera screen shows beside the shutter. `clipEndsAt`
 * (ms since 1970, or null) drives the clip button's countdown. */
export interface NativeCameraOptions {
  showRemember?: boolean
  showClip?: boolean
  remembered?: boolean
  clipEndsAt?: number | null
  /** Session options › Chui's audio › Voice boost, for video clips' sound. */
  videoBoost?: boolean
}

/** A video clip recorded by holding the shutter (up to 30 s, 720p MP4 with
 * the listening mic's sound), saved on the phone with a poster frame. */
export interface NativeVideoClip {
  id: string
  /** file:// URLs */
  path: string
  posterPath: string
  durationMs: number
  width: number
  height: number
  /** ms since 1970, the first frame */
  startedAt: number
}

/** Bridge to ios/App/App/NativeCameraPlugin.swift -- the native camera
 * screen (CameraViewController), only present in the native build. */
interface NativeCameraPlugin {
  /** Sets the camera up ahead of time so it opens at once; it stays off. */
  prepare(): Promise<void>
  /** A finger is on the camera button: starts switching the camera on. */
  warm(): Promise<void>
  /** Switches off a camera kept on after closing (leaving the session). */
  cool(): Promise<void>
  /** Opens the camera over the app. Rejects with code UNAVAILABLE when
   * there's no camera to use. */
  open(options: NativeCameraOptions): Promise<void>
  update(options: NativeCameraOptions): Promise<void>
  close(): Promise<void>
  /** A photo taken: a JPEG file (file:// URL), already turned upright. */
  addListener(event: 'photo', listener: (event: { path: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'video', listener: (event: NativeVideoClip) => void): Promise<PluginListenerHandle>
  addListener(event: 'photoFailed', listener: (event: { message: string }) => void): Promise<PluginListenerHandle>
  /** The camera turned out unusable after its screen showed (it's closed). */
  addListener(event: 'unavailable', listener: (event: { message: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'remember' | 'clip' | 'closed', listener: () => void): Promise<PluginListenerHandle>
}

export const NativeCamera = registerPlugin<NativeCameraPlugin>('NativeCamera')
