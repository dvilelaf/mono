import { useState } from 'react';
import { SectionCard } from '../../components/SectionCard.js';

/**
 * Launcher setup flow — 4-step wizard that turns on the 'launching'
 * role for a SolverNet (Phase A.1: Prediction). Mirrors the
 * NetCard inline-prompt visual rhythm from the Configuration page —
 * Back / Next on steps 1-3, Back / Save on step 4. The generator
 * defaults are passed through unchanged on save; future versions can
 * surface the fields for editing without changing the public shape.
 */

export interface GeneratorDefaults {
  cadenceMs: number;
  maxNewRoundsPerPoll: number;
  maxNewRoundsPerDay: number;
  maxOpenRounds: number;
}

export interface SetupFlowProps {
  netName: string;
  defaults: GeneratorDefaults;
  safeBalanceWei: string;
  onPatch: (
    name: string,
    patch: { launching: true; generator: GeneratorDefaults },
  ) => Promise<unknown>;
  onComplete: () => void;
}

const TOTAL_STEPS = 4;

function describeNet(netName: string): string {
  if (netName === 'prediction') {
    return 'Calibrated probabilistic forecasts of Polymarket-listed events.';
  }
  return netName;
}

function scoreboardFor(netName: string): string | null {
  if (netName === 'prediction') {
    return 'Public scoreboard: Brier spread vs Polymarket consensus over a rolling window.';
  }
  return null;
}

function formatEth(wei: string): string {
  if (!/^\d+$/.test(wei)) return '—';
  try {
    const eth = Number(BigInt(wei)) / 1e18;
    return eth.toFixed(4);
  } catch {
    return '—';
  }
}

const buttonBase = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '14px',
  padding: '10px 20px',
  borderRadius: '6px',
  cursor: 'pointer',
} as const;

const secondaryButton = {
  ...buttonBase,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--fg)',
};

const primaryButton = {
  ...buttonBase,
  border: '1px solid var(--accent-sky)',
  background: 'var(--accent-sky)',
  color: 'var(--bg-sunken)',
};

const stepHeading = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '15px',
  fontWeight: 500,
  color: 'var(--fg)',
  margin: '0 0 8px',
  letterSpacing: '-0.01em',
} as const;

const stepBody = {
  color: 'var(--fg-muted)',
  fontSize: '13px',
  lineHeight: 1.5,
  margin: '0 0 8px',
} as const;

export function SetupFlow({
  netName,
  defaults,
  safeBalanceWei,
  onPatch,
  onComplete,
}: SetupFlowProps): JSX.Element {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await onPatch(netName, { launching: true, generator: defaults });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const next = (): void => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const back = (): void => setStep((s) => Math.max(1, s - 1));

  const cadenceMin = Math.round(defaults.cadenceMs / 60_000);
  const safeEth = formatEth(safeBalanceWei);
  const scoreboard = scoreboardFor(netName);

  return (
    <SectionCard
      title={`Launch ${netName}`}
      summary={`Step ${step} of ${TOTAL_STEPS}`}
      defaultExpanded
    >
      {step === 1 && (
        <div>
          <h2 style={stepHeading}>Confirm SolverNet</h2>
          <p style={stepBody}>{describeNet(netName)}</p>
          {scoreboard && <p style={stepBody}>{scoreboard}</p>}
        </div>
      )}
      {step === 2 && (
        <div>
          <h2 style={stepHeading}>Generator defaults</h2>
          <p style={stepBody}>
            The Launcher generator posts new Tasks at the cadence below. You can adjust these
            after launch from Launcher Configuration.
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '13px',
              color: 'var(--fg)',
              display: 'grid',
              gap: '6px',
            }}
          >
            <li>cadence: {cadenceMin} min</li>
            <li>max new rounds / poll: {defaults.maxNewRoundsPerPoll}</li>
            <li>max new rounds / day: {defaults.maxNewRoundsPerDay}</li>
            <li>max open rounds: {defaults.maxOpenRounds}</li>
          </ul>
        </div>
      )}
      {step === 3 && (
        <div>
          <h2 style={stepHeading}>Budget plan</h2>
          <p style={stepBody}>
            Safe balance {safeEth} ETH funds approximately N Tasks at the current per-attempt
            payment. Top up the Launcher Safe to extend the runway.
          </p>
        </div>
      )}
      {step === 4 && (
        <div>
          <h2 style={stepHeading}>Confirm</h2>
          <p style={stepBody}>
            This will enable launching for {netName}. The generator hot-spawns within one
            cadence — no daemon restart required.
          </p>
          {error && (
            <p
              style={{
                color: 'var(--break-red)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '13px',
                margin: '8px 0 0',
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
        {step > 1 && (
          <button type="button" onClick={back} disabled={saving} style={secondaryButton}>
            Back
          </button>
        )}
        {step < TOTAL_STEPS && (
          <button type="button" onClick={next} style={primaryButton}>
            Next
          </button>
        )}
        {step === TOTAL_STEPS && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            style={{ ...primaryButton, cursor: saving ? 'wait' : 'pointer' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </SectionCard>
  );
}
