import { SectionCard } from '../../components/SectionCard.js';

/**
 * Tier-4 Launcher overview placeholder — describes the future ve-JINN
 * gauge direction surface. No interactivity in v1; explicitly future-
 * facing so launchers know it's coming and don't expect it today.
 *
 * Phase B+ will add gauge-vote controls; the section card here is the
 * permanent home so the information hierarchy in §6.5 of the spec
 * stays stable across phases.
 */
export function EmissionsPlaceholder(): JSX.Element {
  return (
    <SectionCard
      title="Direct JINN emissions to this SolverNet"
      summary="Phase B+ — ve-JINN gauge direction (placeholder)"
      defaultExpanded={false}
      metaChip={{ label: 'Phase B+', tone: 'default' }}
    >
      <p style={{ color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5, fontSize: '14px' }}>
        When ve-JINN gauges ship in Phase B+, you'll be able to direct protocol-level emissions
        toward this SolverNet here.
      </p>
      <p
        style={{
          color: 'var(--fg-dim)',
          fontSize: '12px',
          margin: 0,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        Coming in a later phase. Out of scope for v1.
      </p>
    </SectionCard>
  );
}
