/**
 * Launcher page — entry point for the Launcher mode.
 *
 * This is a placeholder stub. Task 16 fills in the empty / configured states
 * for "Launch a SolverNet" once the underlying API surface lands.
 */
export function LauncherPage(): JSX.Element {
  return (
    <div
      style={{
        padding: '24px',
        fontFamily: "'JetBrains Mono', ui-monospace, SF Mono, Menlo, monospace",
        color: 'var(--fg)',
      }}
    >
      <h1
        style={{
          fontFamily: "'Instrument Serif', 'Times New Roman', serif",
          fontSize: '32px',
          margin: '0 0 12px',
          color: 'var(--fg)',
          fontWeight: 400,
        }}
      >
        Launch a SolverNet
      </h1>
      <p style={{ color: 'var(--fg-muted)', fontSize: '13px' }}>
        Stub. Task 16 fills in the empty/configured states.
      </p>
    </div>
  );
}
