import { useQuery } from '@tanstack/react-query';
import { SectionCard } from '../../components/SectionCard.js';
import { api } from '../../api/client.js';
import type { SolverNetCatalogEntry, SolverNetsCatalogResponse } from '../../api/types.js';
import { NetCard, type NetCardConfig } from './NetCard.js';

const STATE_RANK: Record<string, number> = { live: 0, available: 1, coming_soon: 2 };

/**
 * The bootstrap response can return per-SolverNet config that's missing
 * any combination of fields (enabled, roles, harness, model, plugins) —
 * older configs predate roles, third-party configs may omit model, etc.
 * Merge into a fully-populated NetCardConfig so the card renders sensibly
 * even on partially-shaped input.
 *
 * Backwards-compat: a legacy `role: 'solving' | 'evaluating'` field on the
 * stored config (from a daemon that hasn't been restarted since the
 * roles-array migration) is promoted to `roles: [<role>]` here so the
 * Configuration page never displays a confusingly empty Roles section.
 */
function resolveConfig(
  catalog: SolverNetCatalogEntry,
  stored: (Partial<NetCardConfig> & { role?: 'solving' | 'evaluating' }) | undefined,
): NetCardConfig {
  const fallbackRole = catalog.supportedRoles[0] ?? 'solving';
  const storedRoles = (() => {
    if (Array.isArray(stored?.roles) && (stored?.roles?.length ?? 0) > 0) return stored!.roles!;
    if (stored?.role === 'solving' || stored?.role === 'evaluating') return [stored.role];
    return [fallbackRole];
  })();
  return {
    enabled: stored?.enabled ?? false,
    roles: storedRoles,
    harness: stored?.harness ?? (catalog.compatibleHarnesses[0]?.name ?? ''),
    model: stored?.model ?? 'claude-haiku-4-5-20251001',
    modelExplicit: stored?.model !== undefined,
    plugins: stored?.plugins ?? [],
  };
}

export interface SolverNetsSectionProps {
  /** Stored per-net config from /v1/bootstrap. May be partially-shaped;
   *  resolveConfig fills missing fields with catalog-derived defaults.
   *  Accepts both the legacy `role` field and the canonical `roles`
   *  array — resolveConfig migrates the singular form. */
  configByName: Record<string, Partial<NetCardConfig> & { role?: 'solving' | 'evaluating' }>;
  onSaved: () => void;
  onRestartPending: () => void;
  defaultExpanded?: boolean;
}

export function SolverNetsSection({
  configByName,
  onSaved,
  onRestartPending,
  defaultExpanded = true,
}: SolverNetsSectionProps): JSX.Element {
  const { data, isLoading } = useQuery<SolverNetsCatalogResponse>({
    queryKey: ['solvernets-catalog'],
    queryFn: () => api.getSolverNets(),
    staleTime: 60_000,
  });

  const nets = (data?.nets ?? []).slice().sort((a, b) => (STATE_RANK[a.state] ?? 99) - (STATE_RANK[b.state] ?? 99));
  const enabledCount = nets.filter((n) => configByName[n.name]?.enabled).length;
  const summary = isLoading
    ? 'Loading catalog…'
    : `${nets.length} available · ${enabledCount} enabled · pick what your node participates in`;

  return (
    <SectionCard
      title="SolverNets"
      summary={summary}
      defaultExpanded={defaultExpanded}
      metaChip={enabledCount > 0 ? { label: `${enabledCount} live`, tone: 'live' } : undefined}
    >
      {nets.map((catalog) => (
        <NetCard
          key={catalog.name}
          catalog={catalog}
          config={resolveConfig(catalog, configByName[catalog.name])}
          onSaved={onSaved}
          onRestartPending={onRestartPending}
        />
      ))}
    </SectionCard>
  );
}
