import { useEffect, useState } from 'react'
import { resolveVideoUrl } from '../db'
import type { VideoItem } from '../types'

/** Resolves a video item to a playable URL — immediately if it was just
 * captured (dataUrl already present), otherwise lazily from storage. */
export function useVideoUrl(item: VideoItem): string | undefined {
  const [url, setUrl] = useState(item.dataUrl)

  useEffect(() => {
    if (item.dataUrl) {
      setUrl(item.dataUrl)
      return
    }
    // Not uploaded yet (a clip still only on the phone that recorded it).
    if (!item.videoPath) return
    let cancelled = false
    resolveVideoUrl(item.videoPath)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [item.dataUrl, item.videoPath])

  return url
}

/** A link to a video clip's uploaded poster frame, if it has one. */
export function usePosterUrl(path: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!path) return
    let cancelled = false
    resolveVideoUrl(path)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [path])
  return path ? url : undefined
}
