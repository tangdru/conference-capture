import { useEffect, useState } from 'react'
import { resolvePhotoUrl } from '../db'
import type { PhotoItem } from '../types'

/** Resolves a photo item to a displayable URL — immediately if it was just
 * captured (dataUrl already present), otherwise lazily from storage. */
export function usePhotoUrl(item: PhotoItem): string | undefined {
  const [url, setUrl] = useState(item.dataUrl)

  useEffect(() => {
    if (item.dataUrl) {
      setUrl(item.dataUrl)
      return
    }
    let cancelled = false
    resolvePhotoUrl(item.photoPath)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [item.dataUrl, item.photoPath])

  return url
}
