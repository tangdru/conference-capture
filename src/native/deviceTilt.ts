import { registerPlugin } from '@capacitor/core'

/** Bridge to ios/App/App/DeviceTiltPlugin.swift -- only present in the native build. */
interface DeviceTiltPlugin {
  startWatching(): Promise<void>
  stopWatching(): Promise<void>
  /** Degrees clockwise (0/90/180/270) to turn a portrait frame upright, from how the phone is held. */
  getRotation(): Promise<{ degrees: number }>
}

export const DeviceTilt = registerPlugin<DeviceTiltPlugin>('DeviceTilt')
