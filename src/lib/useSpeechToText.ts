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
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const w = window as any;
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => rec.current?.abort?.();
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
      setError(e?.error === 'not-allowed' ? 'Microphone permission was blocked. Allow it in the browser, or type instead.' : 'Could not hear that. Try again, or type instead.');
      setListening(false);
    };
    r.onend = () => {
      setListening(false);
      if (startedAt.current) setSeconds(Math.round((Date.now() - startedAt.current) / 1000));
    };
    rec.current = r;
    startedAt.current = Date.now();
    setSeconds(0);
    r.start();
    setListening(true);
  }, [lang]);

  const stop = useCallback(() => rec.current?.stop?.(), []);

  return { supported, listening, transcript, setTranscript, error, start, stop, seconds };
}
