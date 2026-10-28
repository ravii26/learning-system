/**
 * Runs the Kokoro voice model off the page's main thread, so the lesson never
 * freezes while speech is being made. The model downloads once (about 90 MB on
 * the fast path) and the browser keeps it afterwards.
 */
import { KokoroTTS } from 'kokoro-js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const ctx: any = self;
let tts: any = null;

async function load() {
  if (tts) return;
  // Report one overall percentage across all model files, not one per file.
  const files: Record<string, { loaded: number; total: number }> = {};
  const progress_callback = (p: any) => {
    if (p?.status !== 'progress' || !p.file || !p.total) return;
    files[p.file] = { loaded: p.loaded, total: p.total };
    let loaded = 0, total = 0;
    for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
    ctx.postMessage({ type: 'progress', value: total ? (loaded / total) * 100 : 0 });
  };
  // WebGPU is much faster; fall back to WASM when it is missing or fails.
  if (ctx.navigator?.gpu) {
    try {
      tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: 'webgpu', progress_callback });
      await tts.generate('Ready.', { voice: 'af_heart' }); // warm-up: compiles the GPU programs now, not mid-lesson
      return;
    } catch { /* try WASM */ }
  }
  tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm', progress_callback });
  await tts.generate('Ready.', { voice: 'af_heart' });
}

ctx.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      await load();
      ctx.postMessage({ type: 'ready' });
    } else if (msg.type === 'generate') {
      await load();
      const out = await tts.generate(msg.text, { voice: msg.voice, speed: msg.speed });
      const audio: Float32Array = out.audio;
      ctx.postMessage({ type: 'audio', id: msg.id, audio, rate: out.sampling_rate }, [audio.buffer]);
    }
  } catch (err: any) {
    ctx.postMessage({ type: 'error', id: msg?.id, message: String(err?.message || err) });
  }
};
