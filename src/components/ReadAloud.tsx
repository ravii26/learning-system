'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { buildNarration, type NarrationPart } from '@/lib/tts/narration';

/**
 * "Listen" button for a lesson. Speech comes from the free Kokoro model, which
 * runs in the reader's own browser (no server, no key, no cost). If the model
 * can't run on this device it falls back to the browser's built-in voice.
 */

const VOICES = [
  { id: 'af_heart', label: 'Heart · warm' },
  { id: 'af_bella', label: 'Bella · lively' },
  { id: 'am_michael', label: 'Michael · calm' },
  { id: 'bf_emma', label: 'Emma · British' },
  { id: 'bm_george', label: 'George · British' },
];
const SPEEDS = [0.85, 1, 1.15, 1.3, 1.5];
const PREF_KEY = 'learning-os.read-aloud';
const USED_KEY = 'learning-os.read-aloud.used';

type Status = 'idle' | 'loading' | 'playing' | 'paused';
type Engine = 'kokoro' | 'browser';
type Clip = { audio: Float32Array; rate: number };

function readPrefs(): { voice: string; speed: number } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return {
      voice: VOICES.some((v) => v.id === p.voice) ? p.voice : VOICES[0].id,
      speed: SPEEDS.includes(p.speed) ? p.speed : 1,
    };
  } catch {
    return { voice: VOICES[0].id, speed: 1 };
  }
}

export default function ReadAloud({ getRoot, intro, resetKey }: {
  /** The element holding the lesson text, read when the user presses Listen. */
  getRoot: () => HTMLElement | null;
  /** Spoken before the lesson body, e.g. the module title and summary. */
  intro?: string[];
  /** Changes when the lesson changes; playback stops. */
  resetKey: string | number;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [voice, setVoice] = useState(VOICES[0].id);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [phase, setPhase] = useState<'download' | 'prepare'>('download');
  const [seek, setSeek] = useState<number | null>(null);

  const partsRef = useRef<NarrationPart[]>([]);
  const runRef = useRef(0);
  const engineRef = useRef<Engine>('kokoro');
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, { resolve: (c: Clip) => void; reject: (e: Error) => void }>());
  const initRef = useRef<Promise<void> | null>(null);
  const cache = useRef(new Map<string, Promise<Clip>>());
  const audioCtx = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const highlighted = useRef<HTMLElement | null>(null);
  const nextId = useRef(1);
  const statusRef = useRef<Status>('idle');
  const voiceRef = useRef(voice);
  const speedRef = useRef(speed);
  statusRef.current = status;
  voiceRef.current = voice;
  speedRef.current = speed;

  useEffect(() => {
    const p = readPrefs();
    setVoice(p.voice);
    setSpeed(p.speed);
  }, []);

  // People who have listened before get the voice loaded quietly in the
  // background, so pressing Listen starts at once. Everyone else downloads
  // nothing until they ask.
  useEffect(() => {
    let used = false;
    try { used = localStorage.getItem(USED_KEY) === '1'; } catch { /* private mode */ }
    if (!used) return;
    const idle = (window as any).requestIdleCallback || ((f: () => void) => setTimeout(f, 1500));
    idle(() => { ensureWorker().catch(() => {}); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setHighlight = (el: HTMLElement | null) => {
    highlighted.current?.classList.remove('tts-reading');
    highlighted.current = el;
    if (!el) return;
    el.classList.add('tts-reading');
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > window.innerHeight - 110) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const silence = () => {
    try { source.current?.stop(); } catch { /* already stopped */ }
    source.current = null;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  };

  const stop = useCallback(() => {
    runRef.current++;
    silence();
    audioCtx.current?.resume().catch(() => {});
    setHighlight(null);
    setStatus('idle');
    setOpen(false);
    setNote(null);
  }, []);

  // Stop when the lesson changes or the page closes.
  useEffect(() => stop, [resetKey, stop]);
  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    audioCtx.current?.close().catch(() => {});
  }, []);

  const ensureWorker = (): Promise<void> => {
    if (initRef.current) return initRef.current;
    initRef.current = new Promise<void>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('../lib/tts/kokoro.worker.ts', import.meta.url), { type: 'module' });
      } catch (e) {
        reject(e as Error);
        return;
      }
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === 'progress') setProgress(Math.round(m.value));
        else if (m.type === 'ready') {
          try { localStorage.setItem(USED_KEY, '1'); } catch { /* private mode */ }
          resolve();
        }
        else if (m.type === 'audio') {
          pending.current.get(m.id)?.resolve({ audio: m.audio, rate: m.rate });
          pending.current.delete(m.id);
        } else if (m.type === 'error') {
          const p = pending.current.get(m.id);
          if (p) { p.reject(new Error(m.message)); pending.current.delete(m.id); }
          else reject(new Error(m.message));
        }
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Voice model failed to start'));
      worker.postMessage({ type: 'init' });
    });
    initRef.current.catch(() => { initRef.current = null; });
    return initRef.current;
  };

  const getClip = (i: number): Promise<Clip> => {
    const key = `${voiceRef.current}|${speedRef.current}|${i}`;
    let p = cache.current.get(key);
    if (!p) {
      const id = nextId.current++;
      p = new Promise<Clip>((resolve, reject) => {
        pending.current.set(id, { resolve, reject });
        workerRef.current!.postMessage({ type: 'generate', id, text: partsRef.current[i].text, voice: voiceRef.current, speed: speedRef.current });
      });
      cache.current.set(key, p);
      p.catch(() => cache.current.delete(key));
      // Keep memory small: only the current and next clips are ever needed.
      for (const k of Array.from(cache.current.keys())) {
        const n = Number(k.split('|')[2]);
        if (n < i - 1 || n > i + 3) cache.current.delete(k);
      }
    }
    return p;
  };

  const playClip = (clip: Clip, run: number) =>
    new Promise<void>((resolve) => {
      const ctx = (audioCtx.current ||= new AudioContext());
      const buf = ctx.createBuffer(1, clip.audio.length, clip.rate);
      buf.copyToChannel(clip.audio as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => resolve();
      source.current = src;
      if (run !== runRef.current) return resolve();
      src.start();
    });

  const speakBrowser = (text: string, run: number) =>
    new Promise<void>((resolve) => {
      if (run !== runRef.current) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = speedRef.current;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });

  const playFrom = useCallback(async (start: number) => {
    const run = ++runRef.current;
    silence();
    const parts = partsRef.current;
    if (engineRef.current === 'kokoro') {
      setStatus('loading');
      setPhase('download');
      try {
        await ensureWorker();
        setPhase('prepare');
      } catch {
        if (run !== runRef.current) return;
        if (typeof speechSynthesis === 'undefined') {
          setNote('Reading aloud isn’t supported on this device.');
          setStatus('idle');
          return;
        }
        engineRef.current = 'browser';
        setNote('The natural voice couldn’t load here, so this is your device’s basic voice.');
      }
    }
    if (run !== runRef.current) return;
    for (let i = start; i < parts.length; i++) {
      if (run !== runRef.current) return;
      setIndex(i);
      setHighlight(parts[i].el);
      try {
        if (engineRef.current === 'kokoro') {
          const clip = await getClip(i);
          // Make the next two pieces while this one plays, so there are no gaps.
          for (let k = i + 1; k <= i + 2 && k < parts.length; k++) getClip(k).catch(() => {});
          if (run !== runRef.current) return;
          setStatus((s) => (s === 'paused' ? s : 'playing'));
          await playClip(clip, run);
        } else {
          setStatus('playing');
          await speakBrowser(parts[i].text, run);
        }
      } catch {
        if (run !== runRef.current) return;
        setNote('Something went wrong while reading. Press play to try again.');
        setStatus('paused');
        return;
      }
    }
    if (run === runRef.current) {
      setHighlight(null);
      setStatus('idle');
      setOpen(false);
    }
  }, []);

  const start = () => {
    const parts = buildNarration(getRoot(), intro);
    if (!parts.length) return;
    partsRef.current = parts;
    cache.current.clear();
    setTotal(parts.length);
    setIndex(0);
    setNote(null);
    setOpen(true);
    playFrom(0);
  };

  const togglePause = () => {
    if (status === 'playing') {
      if (engineRef.current === 'kokoro') audioCtx.current?.suspend();
      else speechSynthesis.pause();
      setStatus('paused');
    } else if (status === 'paused') {
      setNote(null);
      if (engineRef.current === 'kokoro' && audioCtx.current?.state === 'suspended') audioCtx.current.resume();
      else if (engineRef.current === 'browser' && speechSynthesis.paused) speechSynthesis.resume();
      else { playFrom(index); return; }
      setStatus('playing');
    }
  };

  const jump = (to: number) => {
    const n = Math.max(0, Math.min(partsRef.current.length - 1, to));
    audioCtx.current?.resume().catch(() => {});
    playFrom(n);
  };

  const changeVoice = (v: string) => {
    setVoice(v);
    voiceRef.current = v;
    savePrefs(v, speed);
    cache.current.clear();
    if (open) playFrom(index);
  };
  const changeSpeed = (s: number) => {
    setSpeed(s);
    speedRef.current = s;
    savePrefs(voice, s);
    cache.current.clear();
    if (open) playFrom(index);
  };
  const savePrefs = (v: string, s: number) => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ voice: v, speed: s })); } catch { /* private mode */ }
  };


  return (
    <>
      <button
        type="button"
        onClick={() => (open ? stop() : start())}
        aria-pressed={open}
        aria-label={open ? 'Stop listening' : 'Listen to this lesson'}
        title="Listen to this lesson"
        className="btn btn-secondary h-9 gap-1.5 py-0 text-[0.85rem]"
      >
        <Icon name="volume" size={16} /> {open ? 'Stop' : 'Listen'}
      </button>

      {open && (
        <div
          role="region"
          aria-label="Lesson audio player"
          className="fixed bottom-4 left-1/2 z-50 flex w-[min(94vw,40rem)] -translate-x-1/2 flex-col gap-2 rounded-2xl bg-ink px-4 py-3 text-on-ink shadow-lg"
        >
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous paragraph" onClick={() => jump(index - 1)} disabled={status === 'loading'} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40">
              <Icon name="skipBack" size={18} />
            </button>
            <button type="button" aria-label={status === 'playing' ? 'Pause' : 'Play'} onClick={togglePause} disabled={status === 'loading'} className="flex h-10 w-10 items-center justify-center rounded-full bg-on-ink text-ink disabled:opacity-60">
              <Icon name={status === 'playing' ? 'pause' : 'play'} size={18} strokeWidth={2.2} />
            </button>
            <button type="button" aria-label="Next paragraph" onClick={() => jump(index + 1)} disabled={status === 'loading'} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-40">
              <Icon name="skipNext" size={18} />
            </button>
            <div className="ml-1 min-w-0 flex-1 text-[0.85rem]" aria-live="polite">
              {status === 'loading'
                ? phase === 'download'
                  ? `Downloading the voice${progress ? ` · ${progress}%` : ''} (first time only)`
                  : 'Preparing the first sentence…'
                : `Part ${Math.min((seek ?? index) + 1, total)} of ${total}`}
            </div>
            <select aria-label="Voice" value={voice} onChange={(e) => changeVoice(e.target.value)} className="h-8 max-w-[8.5rem] rounded-lg bg-white/15 px-2 text-[0.8rem] text-on-ink">
              {VOICES.map((v) => <option key={v.id} value={v.id} className="text-fg">{v.label}</option>)}
            </select>
            <select aria-label="Speed" value={speed} onChange={(e) => changeSpeed(Number(e.target.value))} className="h-8 rounded-lg bg-white/15 px-2 text-[0.8rem] text-on-ink">
              {SPEEDS.map((s) => <option key={s} value={s} className="text-fg">{s}×</option>)}
            </select>
            <button type="button" aria-label="Close player" onClick={stop} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15">
              <Icon name="close" size={16} />
            </button>
          </div>
          <input
            type="range"
            aria-label="Position in the lesson"
            min={0}
            max={Math.max(total - 1, 0)}
            step={1}
            value={seek ?? index}
            disabled={total < 2}
            onChange={(e) => setSeek(Number(e.target.value))}
            onPointerUp={() => { if (seek !== null) { jump(seek); setSeek(null); } }}
            onKeyUp={() => { if (seek !== null) { jump(seek); setSeek(null); } }}
            onBlur={() => setSeek(null)}
            className="h-1 w-full cursor-pointer accent-current"
          />
          {note && <p className="m-0 text-[0.8rem] opacity-80">{note}</p>}
        </div>
      )}
    </>
  );
}
