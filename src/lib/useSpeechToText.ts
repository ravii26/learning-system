'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browser speech-to-text (Web Speech API: Chrome, Edge, Safari). Free and
 * on-device/browser-provided, so a spoken answer can be checked like a typed
 * one. Where the browser has no support, `supported` is false and the UI
 * falls back to typing.
 */
export function useSpeechToText(lang = 'en-IN') {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<any>(null);
  const finalText = useRef('');
  const startedAt = useRef<number | null>(null);
  // Chrome ends recognition on its own after a pause; keep going until the learner presses Stop.
  const wanted = useRef(false);
  const [seconds, setSeconds] = useState(0);
  // Live count while talking, so a "speak for 90 seconds" target can be watched.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => startedAt.current && setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [listening]);

  useEffect(() => {
    const w = window as any;
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => { wanted.current = false; rec.current?.abort?.(); };
  }, []);

  const start = useCallback(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    setError(null);
    finalText.current = '';
    setTranscript('');
    const r = new SR();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText.current += `${t} `;
        else interim += t;
      }
      setTranscript(`${finalText.current}${interim}`.trim());
    };
    r.onerror = (e: any) => {
      // A pause ("no-speech") or a dropped connection: onend restarts it.
      if (e?.error === 'no-speech' || e?.error === 'aborted' || e?.error === 'network') return;
      wanted.current = false;
      setError(e?.error === 'not-allowed' ? 'Microphone permission was blocked. Allow it in the browser, or type instead.' : 'Could not hear that. Try again, or type instead.');
      setListening(false);
    };
    r.onend = () => {
      if (wanted.current) {
        try {
          r.start();
          return;
        } catch {
          // fall through: couldn't restart
        }
      }
      wanted.current = false;
      setListening(false);
      if (startedAt.current) setSeconds(Math.round((Date.now() - startedAt.current) / 1000));
    };
    rec.current = r;
    startedAt.current = Date.now();
    setSeconds(0);
    setElapsed(0);
    wanted.current = true;
    r.start();
    setListening(true);
  }, [lang]);

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop?.();
  }, []);

  return { supported, listening, transcript, setTranscript, error, start, stop, seconds, elapsed };
}
