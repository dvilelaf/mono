import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { SolverNetsSection } from './configuration/SolverNetsSection.js';
import { NetworkSection } from './configuration/NetworkSection.js';
import { SecuritySection } from './configuration/SecuritySection.js';
import { useHashSection } from './configuration/useHashSection.js';

export interface ConfigurationPageProps {
  onRestartPending?: () => void;
}

interface BootstrapWithChain {
  chain?: 'base' | 'base-sepolia';
  rpcUrl?: string;
  defaultRpcUrl?: string;
}

export function ConfigurationPage({ onRestartPending = () => undefined }: ConfigurationPageProps): JSX.Element {
  const { data } = useQuery<BootstrapWithChain>({
    queryKey: ['bootstrap'],
    queryFn: () => api.getBootstrap() as Promise<BootstrapWithChain>,
    refetchInterval: 1500,
  });

  const hash = useHashSection();
  const expandedSection = hash?.split('/')[0];

  const chain = data?.chain ?? 'base-sepolia';
  const rpcUrl = data?.rpcUrl ?? '';
  const defaultRpcUrl = data?.defaultRpcUrl ?? (chain === 'base' ? 'https://mainnet.base.org' : 'https://sepolia.base.org');

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SolverNetsSection
        defaultExpanded={expandedSection === 'solvernets' || expandedSection === undefined}
      />
      <NetworkSection
        chain={chain}
        rpcUrl={rpcUrl}
        defaultRpcUrl={defaultRpcUrl}
        rpcHealthy={true}
        onRestartPending={onRestartPending}
        defaultExpanded={expandedSection === 'network'}
      />
      <SecuritySection defaultExpanded={expandedSection === 'security'} />
    </div>
  );
}
