import { useState } from 'react';
import { SectionCard } from '../../components/SectionCard.js';
import { ConfigField } from '../../components/ConfigField.js';

/**
 * Per-SolverNet generator config form (Launcher mode > /launcher/configuration).
 *
 * Surfaces the eight `predictionV1*` keys mirrored in
 * `LauncherSolverNetPatch.generator` (client/src/dashboard/spa/src/api/types.ts).
 * Edits hot-apply per spec §5.2 — no restart-required pill.
 *
 * The submitted patch contains only fields the operator actually changed,
 * so a re-save with no diffs would be a no-op against the daemon. The save
 * button stays disabled until at least one field diverges from the
 * persisted `config` prop.
 */

export interface GeneratorConfig {
  cadenceMs: number;
  maxNewRoundsPerPoll: number;
  maxNewRoundsPerDay: number;
  maxOpenRounds: number;
  allowlistConditionIds: string[];
  blocklistConditionIds: string[];
  windowMs: number;
  resolveGapMs: number;
}

export interface GeneratorConfigSectionProps {
  netName: string;
  config: GeneratorConfig;
  onSave: (patch: { generator: Partial<GeneratorConfig> }) => Promise<unknown>;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '8px 10px',
  color: 'var(--fg)',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '13px',
};

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function GeneratorConfigSection({
  netName,
  config,
  onSave,
}: GeneratorConfigSectionProps): JSX.Element {
  const [draft, setDraft] = useState<GeneratorConfig>(config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    draft.cadenceMs !== config.cadenceMs ||
    draft.maxNewRoundsPerPoll !== config.maxNewRoundsPerPoll ||
    draft.maxNewRoundsPerDay !== config.maxNewRoundsPerDay ||
    draft.maxOpenRounds !== config.maxOpenRounds ||
    draft.windowMs !== config.windowMs ||
    draft.resolveGapMs !== config.resolveGapMs ||
    !arraysEqual(draft.allowlistConditionIds, config.allowlistConditionIds) ||
    !arraysEqual(draft.blocklistConditionIds, config.blocklistConditionIds);

  const onSubmit = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<GeneratorConfig> = {};
      if (draft.cadenceMs !== config.cadenceMs) patch.cadenceMs = draft.cadenceMs;
      if (draft.maxNewRoundsPerPoll !== config.maxNewRoundsPerPoll)
        patch.maxNewRoundsPerPoll = draft.maxNewRoundsPerPoll;
      if (draft.maxNewRoundsPerDay !== config.maxNewRoundsPerDay)
        patch.maxNewRoundsPerDay = draft.maxNewRoundsPerDay;
      if (draft.maxOpenRounds !== config.maxOpenRounds)
        patch.maxOpenRounds = draft.maxOpenRounds;
      if (draft.windowMs !== config.windowMs) patch.windowMs = draft.windowMs;
      if (draft.resolveGapMs !== config.resolveGapMs)
        patch.resolveGapMs = draft.resolveGapMs;
      if (!arraysEqual(draft.allowlistConditionIds, config.allowlistConditionIds))
        patch.allowlistConditionIds = draft.allowlistConditionIds;
      if (!arraysEqual(draft.blocklistConditionIds, config.blocklistConditionIds))
        patch.blocklistConditionIds = draft.blocklistConditionIds;
      await onSave({ generator: patch });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title={`${netName} generator`}
      summary="Edits hot-apply within one cadence — no daemon restart required"
      defaultExpanded
    >
      <ConfigField label="Cadence (ms)" helperText="Generator poll interval">
        <input
          aria-label="Cadence"
          type="number"
          value={draft.cadenceMs}
          onChange={(e) => setDraft({ ...draft, cadenceMs: Number(e.target.value) })}
          style={inputStyle}
        />
      </ConfigField>
      <ConfigField label="Max new rounds per poll">
        <input
          aria-label="Max new rounds per poll"
          type="number"
          value={draft.maxNewRoundsPerPoll}
          onChange={(e) =>
            setDraft({ ...draft, maxNewRoundsPerPoll: Number(e.target.value) })
          }
          style={inputStyle}
        />
      </ConfigField>
      <ConfigField label="Max new rounds per day">
        <input
          aria-label="Max new rounds per day"
          type="number"
          value={draft.maxNewRoundsPerDay}
          onChange={(e) =>
            setDraft({ ...draft, maxNewRoundsPerDay: Number(e.target.value) })
          }
          style={inputStyle}
        />
      </ConfigField>
      <ConfigField label="Max open rounds">
        <input
          aria-label="Max open rounds"
          type="number"
          value={draft.maxOpenRounds}
          onChange={(e) => setDraft({ ...draft, maxOpenRounds: Number(e.target.value) })}
          style={inputStyle}
        />
      </ConfigField>
      <ConfigField label="Window (ms)" helperText="Time horizon for resolution candidates">
        <input
          aria-label="Window"
          type="number"
          value={draft.windowMs}
          onChange={(e) => setDraft({ ...draft, windowMs: Number(e.target.value) })}
          style={inputStyle}
        />
      </ConfigField>
      <ConfigField label="Resolve gap (ms)" helperText="Minimum gap before resolution">
        <input
          aria-label="Resolve gap"
          type="number"
          value={draft.resolveGapMs}
          onChange={(e) => setDraft({ ...draft, resolveGapMs: Number(e.target.value) })}
          style={inputStyle}
        />
      </ConfigField>
      <ConfigField
        label="Allowlist condition IDs"
        helperText="Comma-separated. Empty = no allowlist filter"
      >
        <input
          aria-label="Allowlist condition IDs"
          type="text"
          value={draft.allowlistConditionIds.join(',')}
          onChange={(e) =>
            setDraft({ ...draft, allowlistConditionIds: parseCsv(e.target.value) })
          }
          style={inputStyle}
        />
      </ConfigField>
      <ConfigField
        label="Blocklist condition IDs"
        helperText="Comma-separated. Empty = no blocklist filter"
      >
        <input
          aria-label="Blocklist condition IDs"
          type="text"
          value={draft.blocklistConditionIds.join(',')}
          onChange={(e) =>
            setDraft({ ...draft, blocklistConditionIds: parseCsv(e.target.value) })
          }
          style={inputStyle}
        />
      </ConfigField>

      {error && (
        <p
          style={{
            color: 'var(--break-red)',
            marginTop: '12px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
          }}
        >
          {error}
        </p>
      )}
      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!dirty || saving}
          style={{
            border: '1px solid var(--accent-sky)',
            background: dirty && !saving ? 'var(--accent-sky)' : 'transparent',
            color: dirty && !saving ? 'var(--bg-sunken)' : 'var(--fg-muted)',
            borderRadius: '6px',
            padding: '10px 20px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '14px',
            cursor: !dirty || saving ? 'not-allowed' : 'pointer',
            opacity: !dirty || saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </SectionCard>
  );
}
