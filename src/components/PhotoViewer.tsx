import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { PhotoItem } from '../types'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { formatClock } from '../format'
import './PhotoViewer.css'

interface PhotoViewerProps {
  item: PhotoItem
  onClose: () => void
}

export function PhotoViewer({ item, onClose }: PhotoViewerProps) {
  const url = usePhotoUrl(item)

  return (
    <div className="photo-viewer">
      <div className="photo-viewer__top-bar">
        <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
        <button className="photo-viewer__close" onClick={onClose} aria-label="Close photo">
          ✕
        </button>
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
      </div>

      {item.caption && item.caption !== 'Untitled photo' && (
        <div className="photo-viewer__caption">{item.caption}</div>
      )}
    </div>
  )
}
