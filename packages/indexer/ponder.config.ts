/**
 * Ponder configuration for the Jinn protocol indexer.
 *
 * Two chains: Base Sepolia (84532) and Base mainnet (8453).
 * Two contracts: JinnRouter and IdentityRegistry.
 *
 * Environment variables:
 *   PONDER_RPC_URL_84532   — RPC URL for Base Sepolia (required when running on Sepolia)
 *   PONDER_RPC_URL_8453    — RPC URL for Base mainnet (required when running on mainnet)
 *
 * Database:
 *   No DATABASE_URL        — uses PGlite (embedded Postgres) for local dev; data in .ponder/
 *   DATABASE_URL=postgres://... — uses external Postgres for production
 *
 * HyperSync:
 *   Ponder 0.16.x does not have a first-class HyperSync transport config option.
 *   Use a HyperSync-backed RPC URL (e.g. from Envio) in PONDER_RPC_URL_* to get
 *   HyperSync performance; Ponder treats it as a standard JSON-RPC endpoint.
 *   This may be revisited if Ponder adds native HyperSync support in a later release.
 *
 * Addresses:
 *   JinnRouter mainnet:     0xfFa7118A3D820cd4E820010837D65FAfF463181B  (Base mainnet V1)
 *   JinnRouter testnet:     0xdC9BCcEB7aca21Ad4Ca2Fc5B4d7aea6b4F6CedD9  (Base Sepolia V3)
 *   IdentityRegistry 84532: 0x8004A818BFB912233c491871b3d84c89A494BD9e
 *   IdentityRegistry 8453:  0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 *
 * Start blocks:
 *   JinnRouter mainnet:     25_000_000 (conservative; adjust if earlier tasks exist)
 *   JinnRouter testnet:     41_153_291 (from client/src/adapters/mech/adapter.ts)
 *   IdentityRegistry:       per DEFAULT_EXECUTION_DISCOVERY_FROM_BLOCK in onchain-query.ts
 *     84532: 41_100_000
 *     8453:  25_000_000
 */
import { createConfig } from 'ponder';
import { http } from 'viem';
import { JINN_ROUTER_ABI } from './abis/JinnRouter.js';
import { IDENTITY_REGISTRY_ABI } from './abis/IdentityRegistry.js';

export default createConfig({
  chains: {
    baseSepolia: {
      id: 84532,
      rpc: process.env['PONDER_RPC_URL_84532'] ?? 'https://sepolia.base.org',
    },
    base: {
      id: 8453,
      rpc: process.env['PONDER_RPC_URL_8453'] ?? 'https://mainnet.base.org',
    },
  },
  contracts: {
    JinnRouter: {
      abi: JINN_ROUTER_ABI,
      chain: {
        base: {
          address: '0xfFa7118A3D820cd4E820010837D65FAfF463181B',
          startBlock: 25_000_000,
        },
        baseSepolia: {
          address: '0xdC9BCcEB7aca21Ad4Ca2Fc5B4d7aea6b4F6CedD9',
          startBlock: 41_153_291,
        },
      },
    },
    IdentityRegistry: {
      abi: IDENTITY_REGISTRY_ABI,
      chain: {
        base: {
          address: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
          startBlock: 25_000_000,
        },
        baseSepolia: {
          address: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
          startBlock: 41_100_000,
        },
      },
    },
  },
});
