import type { Connector, SyncResult } from "./connector.interface.js";
import { db } from "../db/index.js";
import { incomeStreams } from "../domains/finance/income.schema.js";
import { portfolioSnapshots, wallets } from "../domains/finance/finance.schema.js";
import { and, eq } from "drizzle-orm";
import { importPKCS8, SignJWT } from "jose";
import { randomUUID, createPrivateKey } from "crypto";
import { readFileSync } from "fs";

const CB_API = "https://api.coinbase.com";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let _jwtKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;

async function getJwtKey() {
  if (_jwtKey) return _jwtKey;
  const keyPath = process.env.COINBASE_API_PRIVATE_KEY_PATH;
  let pem: string;
  if (keyPath) {
    pem = readFileSync(keyPath, "utf-8");
  } else {
    pem = process.env.COINBASE_API_PRIVATE_KEY?.replace(/\\n/g, "\n") || "";
  }
  const cryptoKey = createPrivateKey(pem);
  const pkcs8Pem = cryptoKey.export({ type: "pkcs8", format: "pem" }) as string;
  _jwtKey = await importPKCS8(pkcs8Pem, "ES256");
  return _jwtKey;
}

async function cbFetch<T>(path: string): Promise<T> {
  const keyId = process.env.COINBASE_API_KEY_ID;
  if (!keyId) throw new Error("COINBASE_API_KEY_ID not configured");

  const key = await getJwtKey();
  const pathWithoutQuery = path.split("?")[0];
  const uri = `GET api.coinbase.com${pathWithoutQuery}`;

  const jwt = await new SignJWT({
    sub: keyId,
    iss: "cdp",
    aud: ["cdp_service"],
    uri,
  })
    .setProtectedHeader({ alg: "ES256", kid: keyId, nonce: randomUUID(), typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .setNotBefore(Math.floor(Date.now() / 1000))
    .sign(key);

  const res = await fetch(`${CB_API}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, "CB-VERSION": "2024-01-01" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Coinbase API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

interface CoinbaseAccount {
  id: string;
  name: string;
  balance: { amount: string; currency: string };
  native_balance: { amount: string; currency: string };
  type: string;
}

interface CoinbaseTransaction {
  id: string;
  type: string;
  amount: { amount: string; currency: string };
  native_amount: { amount: string; currency: string };
  description: string | null;
  created_at: string;
  status: string;
  details: { title: string; subtitle: string };
}

export const coinbaseConnector: Connector = {
  name: "coinbase",
  schedule: "0 */6 * * *",

  async sync(): Promise<SyncResult> {
    let recordsSynced = 0;

    const accountsResp = await cbFetch<{ data: CoinbaseAccount[] }>("/v2/accounts?limit=100");
    const accounts = accountsResp.data;

    console.log(`[coinbase] Found ${accounts.length} accounts`);

    // Ensure we have a "coinbase" wallet entry
    const [cbWallet] = await db.select().from(wallets)
      .where(and(eq(wallets.address, "Coinbase"), eq(wallets.chain, "multi")));

    const walletId = cbWallet?.id;

    // Store portfolio snapshot
    if (walletId) {
      const positions: Record<string, number> = {};
      let totalUsd = 0;
      for (const acct of accounts) {
        const val = Number(acct.native_balance?.amount || 0);
        if (val > 0.01) {
          const cur = acct.balance?.currency || "USD";
          positions[cur] = (positions[cur] || 0) + val;
          totalUsd += val;
        }
      }

      if (totalUsd > 0) {
        await db.insert(portfolioSnapshots).values({
          walletId,
          totalValueUsd: String(totalUsd),
          positions,
          source: "coinbase",
          snapshotAt: new Date(),
        });
        recordsSynced++;
        console.log(`[coinbase] Portfolio snapshot: $${totalUsd.toFixed(2)}`);
      }
    }

    // Fetch transactions for each account to find yield/rewards
    const yieldTypes = new Set(["interest", "staking_reward", "inflation_reward", "reward_income", "learning_reward"]);

    for (const acct of accounts) {
      if (Number(acct.balance?.amount || 0) === 0) continue;

      try {
        let nextUri: string | null = `/v2/accounts/${acct.id}/transactions?limit=100`;

        while (nextUri) {
          const txResp: { data: CoinbaseTransaction[]; pagination?: { next_uri?: string } } = await cbFetch(nextUri);

          for (const tx of txResp.data || []) {
            if (tx.status !== "completed") continue;
            if (!yieldTypes.has(tx.type)) continue;

            const date = new Date(tx.created_at);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);

            try {
              await db.insert(incomeStreams).values({
                source: "coinbase",
                streamType: tx.type,
                asset: tx.amount?.currency || "USD",
                amount: tx.native_amount?.amount || tx.amount?.amount || "0",
                currency: tx.native_amount?.currency || "USD",
                periodStart: date,
                periodEnd: endDate,
                metadata: {
                  coinbaseId: tx.id,
                  accountName: acct.name,
                  cryptoAmount: tx.amount?.amount,
                  cryptoCurrency: tx.amount?.currency,
                  title: tx.details?.title,
                  subtitle: tx.details?.subtitle,
                },
              }).onConflictDoNothing();
              recordsSynced++;
            } catch {}
          }

          nextUri = txResp.pagination?.next_uri || null;
          if (nextUri) await sleep(250);
        }
      } catch (err) {
        console.error(`[coinbase] Failed for ${acct.name}:`, (err as Error).message);
      }

      await sleep(250);
    }

    return { recordsSynced };
  },
};
