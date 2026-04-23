---
layer: processing
domain: crypto
updated: 2026-04-23
sources:
  - table: yield_positions
    query: SELECT * FROM yield_positions
  - table: portfolio_snapshots
    query: SELECT * FROM portfolio_snapshots
  - table: wallets
    query: SELECT * FROM wallets
---

# Yield positions + portfolios

## TL;DR
**0 rows** in yield_positions, portfolio_snapshots, wallets as of 2026-04-23 (first verified extract run). Crypto connector ran 15 times today — all status=success, records_synced=0. Data pipeline exists but is not yet pulling data.

## Actual schema (verified 2026-04-23)
`yield_positions`: id, name, protocol, chain, token, token_balance, token_price, value_usd, apy, snapshot_at, metadata, created_at
`portfolio_snapshots`: id, wallet_id, total_value_usd, positions (jsonb), source, snapshot_at, created_at

## Sources (planned — not yet populated)
- **Zerion** (API): 20 EVM wallets, 15-min cron. Auto.
- **Coinbase yield** (CDP API): interest/reward txs, 6h cron. Auto. **Balance cannot be read via CDP** — $1.4M position requires manual entry.
- **Yield positions table**: manual + Zerion + DeFiLlama hybrid. Balances snapshotted every 3 days via pm2 cron.

## Known gotchas
- APYs are **live fetched** — not stored per snapshot. Historical APY reconstruction is lossy.
- $1.4M Coinbase position requires manual entry. Any CDP-only query will understate portfolio by ~$1.4M.
- **Schema drift corrected**: earlier page referenced `position_name`, `balance_usd`, `apy_pct`, `annualised_yield_usd`, `active` — none of these columns exist. Correct names: `name`, `value_usd`, `apy`. No `active` flag.

## Relevance to goals
- **$170K annualised yield** (up from $130K current) — needs annualised view per position.
- **Deploy 68 ETH, LDO→USDC, $200K off MEXC** — immediate April 2026 actions.
- **EY tax conversation** — £26K difference conservative vs aggressive DeFi yield treatment.

## How to query (corrected)
```sql
SELECT name, protocol, chain, token, value_usd, apy,
       value_usd * apy / 100 AS annualised_yield_usd,
       snapshot_at
FROM yield_positions
ORDER BY snapshot_at DESC, value_usd DESC;
```

## Open questions
- Why is the crypto connector syncing 0 records despite 15 successful runs today?
- Is the $1.4M Coinbase manual entry pending data import?
- Can DeFiLlama APY snapshots be persisted per position at each balance snapshot?
