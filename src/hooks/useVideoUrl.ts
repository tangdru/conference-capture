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
