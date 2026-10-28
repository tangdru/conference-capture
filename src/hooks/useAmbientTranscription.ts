import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { AmbientTranscription } from '../native/ambientTranscription'

const CHUNK_MS = 30_000
// Below this RMS, treat the chunk as silence and skip it -- Whisper tends to
// hallucinate text on near-silent audio rather than returning nothing.
const SILENCE_RMS_THRESHOLD = 0.01
// Safety cap on how long teardown waits for the trailing chunk's
// transcription before releasing the mic/worker anyway -- stops a hung
// decode or worker from holding the microphone open indefinitely.
const FLUSH_TIMEOUT_MS = 15_000
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
 * each cycle's blob is discarded once transcribed. The trailing partial
 * cycle (whatever was recorded since the last 30s boundary) is flushed
 * through transcription on stop too, not dropped -- the mic stream and
 * worker are kept alive until that final chunk's result actually comes
 * back (or a bounded safety timeout elapses), so the last few seconds of
 * a session are never silently lost. */
export function useAmbientTranscription({ active, onSegment, onError }: UseAmbientTranscriptionOptions): void {
  const onSegmentRef = useRef(onSegment)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onSegmentRef.current = onSegment
    onErrorRef.current = onError
  }, [onSegment, onError])

  useEffect(() => {
    if (!active) return

    // Native build: Apple's Speech framework does the whole pipeline
    // (capture, segmenting, transcription), and keeps going while the phone
    // is locked. Everything below is the web fallback.
    if (Capacitor.isNativePlatform()) {
      return startNativeTranscription(
        (segment) => onSegmentRef.current(segment.text, segment.startedAt, segment.durationMs),
        (message) => onErrorRef.current(message),
      )
    }

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
    let flushTimeout: number | null = null
    const pending = new Map<number, { startedAt: number }>()
    let nextId = 0
    // Counts transcribeChunk() calls whose full round trip (decode -> worker
    // response) hasn't resolved yet. Teardown waits for this to hit zero so
    // the final partial chunk isn't cut off mid-transcription.
    let pendingFlushes = 0
    let teardownRequested = false
    let tornDown = false

    const worker = new Worker(new URL('../workers/transcribeWorker.ts', import.meta.url), { type: 'module' })

    function teardown() {
      if (tornDown) return
      tornDown = true
      if (flushTimeout) window.clearTimeout(flushTimeout)
      stream?.getTracks().forEach((t) => t.stop())
      worker.terminate()
      pending.clear()
    }

    function maybeTeardown() {
      if (teardownRequested && pendingFlushes === 0) teardown()
    }

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
      pendingFlushes--
      maybeTeardown()
    }

    async function transcribeChunk(blob: Blob, startedAt: number) {
      pendingFlushes++
      let posted = false
      try {
        const samples = await decodeToMono16k(blob)
        if (rms(samples) < SILENCE_RMS_THRESHOLD) return
        const id = nextId++
        pending.set(id, { startedAt })
        worker.postMessage({ id, samples }, [samples.buffer])
        posted = true
      } catch {
        // Best-effort -- a chunk that fails to decode just gets skipped.
      } finally {
        // Silent or failed-to-decode chunks never reach the worker, so
        // nothing will ever resolve them in worker.onmessage -- settle the
        // flush here instead. A successfully posted chunk stays pending
        // until its actual response comes back.
        if (!posted) {
          pendingFlushes--
          maybeTeardown()
        }
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
      teardownRequested = true
      if (cycleTimeout) window.clearTimeout(cycleTimeout)
      flushTimeout = window.setTimeout(teardown, FLUSH_TIMEOUT_MS)

      if (recorder && recorder.state !== 'inactive') {
        // Let the recorder's own onstop handler fire naturally: it
        // transcribes this trailing partial chunk instead of dropping it,
        // and skips starting a new cycle since `cancelled` is now true. The
        // mic stream and worker stay alive until that chunk's result
        // actually comes back (maybeTeardown), bounded by the safety
        // timeout above in case the worker never responds.
        recorder.stop()
      } else {
        maybeTeardown()
      }
    }
  }, [active])
}

/** Starts the native plugin and returns the effect cleanup. stop() flushes the
 * trailing segment natively, so listeners stay attached until it resolves. */
function startNativeTranscription(
  onSegment: (segment: { text: string; startedAt: number; durationMs: number }) => void,
  onError: (message: string) => void,
): () => void {
  let stopped = false
  const listeners = Promise.all([
    AmbientTranscription.addListener('segment', onSegment),
    AmbientTranscription.addListener('error', ({ message }) => onError(message)),
  ])
  const started = listeners
    .then(() => (stopped ? undefined : AmbientTranscription.start()))
    .catch((err: unknown) => onError(err instanceof Error ? err.message : 'Microphone unavailable.'))

  return () => {
    stopped = true
    void started
      .then(() => AmbientTranscription.stop())
      .catch(() => {})
      .finally(() => listeners.then((handles) => handles.forEach((h) => h.remove())))
  }
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
