// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppMode } from './useAppMode.js';

describe('useAppMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to "operator"', () => {
    const { result } = renderHook(() => useAppMode());
    expect(result.current.mode).toBe('operator');
  });

  it('persists mode to localStorage on change', () => {
    const { result } = renderHook(() => useAppMode());
    act(() => result.current.setMode('launcher'));
    expect(result.current.mode).toBe('launcher');
    expect(localStorage.getItem('jinn.app.mode')).toBe('launcher');
  });

  it('hydrates from localStorage on mount', () => {
    localStorage.setItem('jinn.app.mode', 'launcher');
    const { result } = renderHook(() => useAppMode());
    expect(result.current.mode).toBe('launcher');
  });

  it('ignores unknown values in localStorage and falls back to operator', () => {
    localStorage.setItem('jinn.app.mode', 'invalid-value');
    const { result } = renderHook(() => useAppMode());
    expect(result.current.mode).toBe('operator');
  });
});
