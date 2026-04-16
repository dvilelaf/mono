/**
 * Coinbase CDP faucet integration for automatic Base Sepolia testnet funding.
 *
 * SECURITY: The shipped default API key grants testnet faucet access ONLY.
 * No mainnet access, no wallet control, no financial risk.
 *
 * KEY ROTATION: Change the constants below and publish a new npm version.
 */

// Jinn project CDP API key — testnet faucet access only
const JINN_DEFAULT_CDP_API_KEY_ID = 'yAY2P1e181EHl5bsrrkwyUkHCfok5rh1';

const MANUAL_FAUCET_URL = 'https://portal.cdp.coinbase.com/products/faucet';

export interface FaucetResult {
  ok: boolean;
  txHash?: string;
  reason?: string;
  rateLimited?: boolean;
}

export async function requestTestnetFunding(
  address: string,
  network: 'base-sepolia',
): Promise<FaucetResult> {
  // Resolve API key: env override > shipped default
  const apiKeyId = process.env['CDP_API_KEY_ID'] ?? JINN_DEFAULT_CDP_API_KEY_ID;

  // Warn on partial override
  if ((process.env['CDP_API_KEY_ID'] && !process.env['CDP_API_KEY_SECRET']) ||
      (!process.env['CDP_API_KEY_ID'] && process.env['CDP_API_KEY_SECRET'])) {
    console.error('[faucet] Warning: Only one of CDP_API_KEY_ID/CDP_API_KEY_SECRET is set. Using defaults.');
  }

  // Dynamic import — SDK is optional
  let CdpClient: any;
  try {
    const mod = await import('@coinbase/cdp-sdk');
    CdpClient = mod.CdpClient;
  } catch {
    return {
      ok: false,
      reason: `Coinbase CDP SDK not installed. Install with: npm install @coinbase/cdp-sdk\nOr fund manually: ${MANUAL_FAUCET_URL}`,
    };
  }

  try {
    const clientOpts: Record<string, string> = { apiKeyId };
    if (process.env['CDP_API_KEY_SECRET']) {
      clientOpts.apiKeySecret = process.env['CDP_API_KEY_SECRET'];
    }
    const cdp = new CdpClient(clientOpts);
    const result = await cdp.evm.requestFaucet({
      address,
      network: 'base-sepolia',
      token: 'eth',
    });
    return { ok: true, txHash: result.transactionHash ?? String(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isRateLimit = message.toLowerCase().includes('rate limit') ||
                        message.toLowerCase().includes('already claimed') ||
                        message.includes('429');
    if (isRateLimit) {
      return {
        ok: false,
        rateLimited: true,
        reason: `Faucet rate limited (1 claim per 24 hours per address). Fund manually: ${MANUAL_FAUCET_URL}`,
      };
    }
    return {
      ok: false,
      reason: `Faucet error: ${message}. Fund manually: ${MANUAL_FAUCET_URL}`,
    };
  }
}
