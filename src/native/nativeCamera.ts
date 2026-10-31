import { registerPlugin } from '@capacitor/core'

export type FlashMode = 'off' | 'auto' | 'on'

export interface NativeCameraInfo {
  /** Lens buttons to offer, in Camera app units (0.5 ultra-wide, 1 main, ...). */
  lenses: number[]
  minZoom: number
  maxZoom: number
  zoom: number
  flash: boolean
}

/** Bridge to ios/App/App/NativeCameraPlugin.swift -- only present in the native build. */
interface NativeCameraPlugin {
  /** Opens the camera with its live preview behind the page at this rect (CSS px). */
  start(rect: { x: number; y: number; width: number; height: number }): Promise<NativeCameraInfo>
  stop(): Promise<void>
  setZoom(options: { zoom: number; animated?: boolean }): Promise<{ zoom: number }>
  /** Focus and expose at a point in the preview, 0..1 across and down. */
  focus(point: { x: number; y: number }): Promise<void>
  /** Base64 JPEG, turned `degrees` clockwise (DeviceTilt) for a sideways phone. */
  capture(options: { flash: FlashMode; degrees: number }): Promise<{ data: string }>
}

export const NativeCamera = registerPlugin<NativeCameraPlugin>('NativeCamera')
