import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
  type AutomaticSpeechRecognitionOutput,
} from '@huggingface/transformers'

// GitHub Pages can't set the Cross-Origin-Opener/Embedder-Policy headers
// multi-threaded WASM needs, so force single-threaded rather than let
// onnxruntime-web silently fail to find SharedArrayBuffer.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1

interface InMessage {
  id: number
  samples: Float32Array
}

type OutMessage =
  | { id: number; status: 'done'; text: string }
  | { id: number; status: 'error'; error: string }

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null

function getTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
      dtype: 'q8',
    })
  }
  return transcriberPromise
}

self.onmessage = async (event: MessageEvent<InMessage>) => {
  const { id, samples } = event.data
  try {
    const transcriber = await getTranscriber()
    const result = (await transcriber(samples)) as AutomaticSpeechRecognitionOutput
    const text = Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text
    const message: OutMessage = { id, status: 'done', text: text.trim() }
    self.postMessage(message)
  } catch (err) {
    const message: OutMessage = {
      id,
      status: 'error',
      error: err instanceof Error ? err.message : 'Transcription failed',
    }
    self.postMessage(message)
  }
}
