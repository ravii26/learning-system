import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'learning_os_timer_state';

interface TimerState {
  secondsRemaining: number;
  isActive: boolean;
  mode: 'study' | 'shortBreak' | 'longBreak';
  presetMinutes: number;
  lastUpdated: number;
}

export function useStudyTimer() {
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'study' | 'shortBreak' | 'longBreak'>('study');
  const [presetMinutes, setPresetMinutes] = useState(25);
  const [isCompleted, setIsCompleted] = useState(false);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: TimerState = JSON.parse(saved);
        const now = Date.now();
        if (parsed.isActive) {
          const elapsedSecs = Math.floor((now - parsed.lastUpdated) / 1000);
          const remaining = Math.max(0, parsed.secondsRemaining - elapsedSecs);
          setSecondsRemaining(remaining);
          setIsActive(remaining > 0);
          if (remaining === 0) setIsCompleted(true);
        } else {
          setSecondsRemaining(parsed.secondsRemaining);
          setIsActive(false);
        }
        setMode(parsed.mode);
        setPresetMinutes(parsed.presetMinutes);
      }
    } catch (e) {
      console.error('Failed to load timer from localStorage:', e);
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    try {
      const state: TimerState = {
        secondsRemaining,
        isActive,
        mode,
        presetMinutes,
        lastUpdated: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save timer state:', e);
    }
  }, [secondsRemaining, isActive, mode, presetMinutes]);

  // Interval timer ticks
  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            setIsActive(false);
            setIsCompleted(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive]);

  const startTimer = useCallback(() => {
    setIsActive(true);
    setIsCompleted(false);
  }, []);

  const pauseTimer = useCallback(() => {
    setIsActive(false);
  }, []);

  const resetTimer = useCallback((newMode: 'study' | 'shortBreak' | 'longBreak' = 'study', customMinutes?: number) => {
    const mins = customMinutes || (newMode === 'study' ? 25 : newMode === 'shortBreak' ? 5 : 15);
    setMode(newMode);
    setPresetMinutes(mins);
    setSecondsRemaining(mins * 60);
    setIsActive(false);
    setIsCompleted(false);
  }, []);

  const dismissCompleted = useCallback(() => {
    setIsCompleted(false);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return {
    secondsRemaining,
    isActive,
    mode,
    presetMinutes,
    isCompleted,
    startTimer,
    pauseTimer,
    resetTimer,
    dismissCompleted,
    formattedTime: formatTime(secondsRemaining),
  };
}
