import type { VideoItem } from '../types'
import { useVideoUrl } from '../hooks/useVideoUrl'
import { formatClock } from '../format'
import './VideoViewer.css'

interface VideoViewerProps {
  item: VideoItem
  onClose: () => void
}

export function VideoViewer({ item, onClose }: VideoViewerProps) {
  const url = useVideoUrl(item)

  return (
    <div className="video-viewer">
      <div className="video-viewer__top-bar">
        <span className="mono-timestamp">{formatClock(item.timestamp)}</span>
        <button className="video-viewer__close" onClick={onClose} aria-label="Close video">
          ✕
        </button>
      </div>

      <div className="video-viewer__stage">
        {url && <video className="video-viewer__video" src={url} controls autoPlay playsInline />}
      </div>
    </div>
  )
}
