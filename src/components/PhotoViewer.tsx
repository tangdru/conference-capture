import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Haptics, NotificationType } from '@capacitor/haptics'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { PhotoItem } from '../types'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { formatClock } from '../format'
import { PHOTOS_DENIED_MESSAGE, saveToPhotoLibrary } from '../native/photoLibrary'
import { CheckIcon, SaveToPhotosIcon } from './InlineIcons'
import './PhotoViewer.css'

interface PhotoViewerProps {
  item: PhotoItem
  onClose: () => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'denied' | 'failed'

// Swipe down past this (or flick down fast) closes the photo, like after
// taking one; a shorter drag springs back.
const CLOSE_DISTANCE = 100
const CLOSE_SPEED = 0.6 // px per ms

const SAVE_MESSAGES: Partial<Record<SaveState, string>> = {
  saved: 'Saved to Photos',
  denied: PHOTOS_DENIED_MESSAGE,
  failed: "Couldn't save this photo",
}

export function PhotoViewer({ item, onClose }: PhotoViewerProps) {
  const url = usePhotoUrl(item)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  // Swipe down to close, only while the photo isn't zoomed in (zoomed, a
  // drag moves around the photo instead).
  const scale = useRef(1)
  const drag = useRef<{ x: number; y: number; at: number; down: boolean | null } | null>(null)
  const [pull, setPull] = useState(0)
  const [settling, setSettling] = useState(false)

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1 || scale.current > 1.01) {
      drag.current = null
      setPull(0)
      return
    }
    drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now(), down: null }
    setSettling(false)
  }

  function handleTouchMove(e: React.TouchEvent) {
    const d = drag.current
    if (!d || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - d.x
    const dy = e.touches[0].clientY - d.y
    // Decide once, after a little movement, whether this is a swipe down.
    if (d.down === null && Math.hypot(dx, dy) > 8) d.down = dy > 0 && dy > Math.abs(dx)
    if (d.down) setPull(Math.max(0, dy))
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const d = drag.current
    drag.current = null
    if (!d?.down) return
    const dy = Math.max(0, e.changedTouches[0].clientY - d.y)
    const speed = dy / Math.max(1, Date.now() - d.at)
    if (dy > CLOSE_DISTANCE || speed > CLOSE_SPEED) {
      onClose()
      return
    }
    setSettling(true)
    setPull(0)
  }

  useEffect(() => {
    if (saveState === 'idle' || saveState === 'saving') return
    const timer = setTimeout(() => setSaveState('idle'), 3000)
    return () => clearTimeout(timer)
  }, [saveState])

  async function save() {
    if (!url || saveState === 'saving') return
    setSaveState('saving')
    try {
      await saveToPhotoLibrary(url)
      setSaveState('saved')
      void Haptics.notification({ type: NotificationType.Success })
    } catch (err) {
      setSaveState((err as { code?: string }).code === 'denied' ? 'denied' : 'failed')
    }
  }

  return (
    <div
      className="photo-viewer"
      style={{ background: `rgba(0, 0, 0, ${Math.max(0.3, 1 - pull / 400)})` }}
    >
      <div className="photo-viewer__top-bar">
        <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
        <div className="photo-viewer__actions">
          {Capacitor.isNativePlatform() && (
            <button
              className="photo-viewer__save"
              onClick={save}
              disabled={!url || saveState === 'saving'}
              aria-label="Save to Photos"
            >
              {saveState === 'saved' ? <CheckIcon /> : <SaveToPhotosIcon />}
            </button>
          )}
          <button className="photo-viewer__close" onClick={onClose} aria-label="Close photo">
            ✕
          </button>
        </div>
      </div>

      <div
        className={`photo-viewer__stage${settling ? ' photo-viewer__stage--settling' : ''}`}
        style={pull ? { transform: `translateY(${pull}px) scale(${Math.max(0.85, 1 - pull / 1500)})` } : undefined}
        // Capture phase: the zoom library stops touches from bubbling.
        onTouchStartCapture={handleTouchStart}
        onTouchMoveCapture={handleTouchMove}
        onTouchEndCapture={handleTouchEnd}
        onTouchCancelCapture={() => { drag.current = null; setSettling(true); setPull(0) }}
      >
        {url && (
          <TransformWrapper
            onTransform={(_, state) => { scale.current = state.scale }}
            initialScale={1}
            minScale={1}
            maxScale={5}
            doubleClick={{ mode: 'toggle', step: 2 }}
            panning={{ velocityDisabled: true }}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <img className="photo-viewer__img" src={url} alt="" />
            </TransformComponent>
          </TransformWrapper>
        )}
        <div className="photo-viewer__status" role="status">
          {SAVE_MESSAGES[saveState] && <span>{SAVE_MESSAGES[saveState]}</span>}
        </div>
      </div>

      {item.caption && item.caption !== 'Untitled photo' && (
        <div className="photo-viewer__caption">{item.caption}</div>
      )}
    </div>
  )
}
