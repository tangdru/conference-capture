import { useEffect, useState } from 'react'
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

const SAVE_MESSAGES: Partial<Record<SaveState, string>> = {
  saved: 'Saved to Photos',
  denied: PHOTOS_DENIED_MESSAGE,
  failed: "Couldn't save this photo",
}

export function PhotoViewer({ item, onClose }: PhotoViewerProps) {
  const url = usePhotoUrl(item)
  const [saveState, setSaveState] = useState<SaveState>('idle')

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
    <div className="photo-viewer">
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

      <div className="photo-viewer__stage">
        {url && (
          <TransformWrapper
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
