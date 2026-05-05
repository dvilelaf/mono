/**
 * Launcher configuration page — per-SolverNet generator config.
 *
 * This is a placeholder stub. Task 17 fills in the per-SolverNet generator
 * config form once the launcher PATCH endpoint surface lands.
 */
export function LauncherConfigurationPage(): JSX.Element {
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
        Generator config
      </h1>
      <p style={{ color: 'var(--fg-muted)', fontSize: '13px' }}>
        Stub. Task 17 fills in the per-SolverNet generator config form.
      </p>
    </div>
  );
}
