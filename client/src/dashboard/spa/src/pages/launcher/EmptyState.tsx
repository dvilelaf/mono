import { SectionCard } from '../../components/SectionCard.js';

/**
 * Launcher empty state — shown on the Launcher overview when no
 * SolverNet has 'launching' in its roles. The CTA opens the 4-step
 * SetupFlow that toggles 'launching' on for the chosen SolverNet.
 *
 * Phase A.1 ships only the Prediction SolverNet, so the CTA is hard-
 * coded to 'prediction'. Future SolverNets can lift this into a
 * catalog-driven list without changing the public component shape.
 */
export interface EmptyStateProps {
  onLaunch: (netName: string) => void;
}

export function EmptyState({ onLaunch }: EmptyStateProps): JSX.Element {
  return (
    <SectionCard
      title="Launch a SolverNet"
      summary="Direct the network's effort toward producing a kind of knowledge."
      defaultExpanded
    >
      <h2
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '20px',
          color: 'var(--fg)',
          margin: '0 0 12px',
          fontWeight: 500,
          letterSpacing: '-0.01em',
        }}
      >
        You haven't launched a SolverNet yet.
      </h2>
      <p style={{ color: 'var(--fg-muted)', margin: '0 0 20px', lineHeight: 1.5, fontSize: '14px' }}>
        A SolverNet directs the network's effort toward producing a kind of knowledge.
        As Launcher you fund the Tasks operators attempt — and own what gets produced.
      </p>
      <div>
        <button
          type="button"
          onClick={() => onLaunch('prediction')}
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '14px',
            padding: '12px 20px',
            background: 'var(--accent-sky)',
            color: 'var(--bg-sunken)',
            border: '1px solid var(--accent-sky)',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Launch Prediction SolverNet
        </button>
      </div>
    </SectionCard>
  );
}
