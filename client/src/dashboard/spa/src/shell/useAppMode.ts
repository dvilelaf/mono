import { useState, useCallback } from 'react';

export type AppMode = 'operator' | 'launcher';

const STORAGE_KEY = 'jinn.app.mode';

export interface UseAppMode {
  mode: AppMode;
  setMode: (m: AppMode) => void;
}

function readStored(): AppMode {
  if (typeof window === 'undefined') return 'operator';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'launcher' ? 'launcher' : 'operator';
}

export function useAppMode(): UseAppMode {
  const [mode, setModeState] = useState<AppMode>(readStored);
  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, m);
    }
  }, []);
  return { mode, setMode };
}
