import { useEffect, useRef } from 'react'

const CHUNK_MS = 30_000
// Below this RMS, treat the chunk as silence and skip it -- Whisper tends to
// hallucinate text on near-silent audio rather than returning nothing.
const SILENCE_RMS_THRESHOLD = 0.01
const CANDIDATE_MIME_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

interface WorkerDoneMessage {
  id: number
  status: 'done'
  text: string
}

interface WorkerErrorMessage {
  id: number
  status: 'error'
  error: string
}

type WorkerMessage = WorkerDoneMessage | WorkerErrorMessage

interface UseAmbientTranscriptionOptions {
  /** Capture only runs while this is true -- pause it alongside the session's own recording state. */
  active: boolean
  onSegment: (text: string, startedAt: number, durationMs: number) => void
  onError: (message: string) => void
}

/** Headless ambient audio capture: continuously records in ~30s cycles while
 * active, transcribes each cycle on-device via a Whisper worker, and reports
 * completed segments with their absolute start time. No raw audio is kept —
 * each cycle's blob is discarded once transcribed. */
export function useAmbientTranscription({ active, onSegment, onError }: UseAmbientTranscriptionOptions): void {
  const onSegmentRef = useRef(onSegment)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onSegmentRef.current = onSegment
    onErrorRef.current = onError
  }, [onSegment, onError])

  useEffect(() => {
    if (!active) return

    const pickedMimeType = pickMimeType()
    if (!pickedMimeType) {
      onErrorRef.current('Ambient transcription isn’t supported in this browser.')
      return
    }
    const mimeType: string = pickedMimeType

    let cancelled = false
    let stream: MediaStream | null = null
    let recorder: MediaRecorder | null = null
    let cycleTimeout: number | null = null
    const pending = new Map<number, { startedAt: number }>()
    let nextId = 0

    const worker = new Worker(new URL('../workers/transcribeWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      if (message.status === 'done' && message.text) {
        onSegmentRef.current(message.text, entry.startedAt, Date.now() - entry.startedAt)
      }
      // Errors are dropped silently -- ambient transcription is best-effort
      // background enrichment, not something worth interrupting capture for.
    }

    async function transcribeChunk(blob: Blob, startedAt: number) {
      try {
        const samples = await decodeToMono16k(blob)
        if (rms(samples) < SILENCE_RMS_THRESHOLD) return
        const id = nextId++
        pending.set(id, { startedAt })
        worker.postMessage({ id, samples }, [samples.buffer])
      } catch {
        // Best-effort -- a chunk that fails to decode just gets skipped.
      }
    }

    function startCycle() {
      if (!stream || cancelled) return
      const chunks: Blob[] = []
      const cycleStartedAt = Date.now()
      const cycleRecorder = new MediaRecorder(stream, { mimeType })
      cycleRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      cycleRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType })
        void transcribeChunk(blob, cycleStartedAt)
        if (!cancelled) startCycle()
      }
      cycleRecorder.start()
      recorder = cycleRecorder
      cycleTimeout = window.setTimeout(() => {
        if (cycleRecorder.state !== 'inactive') cycleRecorder.stop()
      }, CHUNK_MS)
    }

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((acquired) => {
        if (cancelled) {
          acquired.getTracks().forEach((t) => t.stop())
          return
        }
        stream = acquired
        startCycle()
      })
      .catch(() => onErrorRef.current('Microphone unavailable — check browser permissions.'))

    return () => {
      cancelled = true
      if (cycleTimeout) window.clearTimeout(cycleTimeout)
      if (recorder && recorder.state !== 'inactive') {
        // Drop the trailing partial chunk rather than let onstop fire a
        // transcription + restart after teardown.
        recorder.onstop = null
        recorder.stop()
      }
      stream?.getTracks().forEach((t) => t.stop())
      worker.terminate()
      pending.clear()
    }
  }, [active])
}

function rms(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

/** Decodes a recorded blob to mono Float32 PCM at 16kHz — the format Whisper expects. */
async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  // Only used as a decoder (never rendered), so numberOfChannels/length are
  // placeholders -- the sampleRate is what makes decodeAudioData resample.
  const audioContext = new OfflineAudioContext(1, 1, 16000)
  const decoded = await audioContext.decodeAudioData(arrayBuffer)
  if (decoded.numberOfChannels === 1) return decoded.getChannelData(0)
  const left = decoded.getChannelData(0)
  const right = decoded.getChannelData(1)
  const mono = new Float32Array(left.length)
  for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) / 2
  return mono
}
