import type { AppMode } from './useAppMode.js';

interface ModeSwitchProps {
  mode: AppMode;
  onChange: (m: AppMode) => void;
}

const MODES: AppMode[] = ['operator', 'launcher'];

export function ModeSwitch({ mode, onChange }: ModeSwitchProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label="App mode"
      style={{
        display: 'inline-flex',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      {MODES.map((m, idx) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => {
              if (m !== mode) onChange(m);
            }}
            data-active={active ? 'true' : 'false'}
            style={{
              padding: '8px 16px',
              fontFamily: "'JetBrains Mono', ui-monospace, SF Mono, Menlo, monospace",
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              color: active ? 'var(--fg)' : 'var(--fg-muted)',
              background: active ? 'var(--bg)' : 'transparent',
              border: 'none',
              borderRight: idx < MODES.length - 1 ? '1px solid var(--border)' : 'none',
              cursor: active ? 'default' : 'pointer',
            }}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
