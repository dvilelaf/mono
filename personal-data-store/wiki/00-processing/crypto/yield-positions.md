---
layer: processing
domain: crypto
updated: 2026-05-04
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
**63 yield position rows** (9 positions × 7 snapshots), **3,047 portfolio snapshots** (2026-04-23 to 2026-05-04, 12 days), **89 wallets** as of 2026-05-04. APY field populated on the 2026-05-02 and 2026-05-03 snapshots; earlier 5 snapshots still NULL.

## Current positions (latest snapshot: 2026-05-03, with APY)
| name | protocol | chain | token | value_usd | apy (%) | annualised yield |
|---|---|---|---|---|---|---|
| Coinbase Earn (Stablecoins) | coinbase | coinbase | USDC | $1,146,000 | 4.10 | $46,986 |
| Steakhouse Prime Instant | morpho | ethereum | steakUSDC | $680,466 | 3.68 | $25,041 |
| Staked Ethena USDe | ethena | ethereum | sUSDe | $506,179 | 3.22 | $16,277 |
| Savings USDS | sky | ethereum | sUSDS | $445,784 | 3.65 | $16,271 |
| Lido Staked ETH | lido | ethereum | stETH | $277,476 | 2.38 | $6,590 |
| Syrup USDT | maple | ethereum | syrupUSDT | $263,049 | 4.54 | $11,953 |
| Jupiter Lend USDT | jupiter | solana | jlUSDT | $257,478 | 3.05 | $7,840 |
| Revolut GBP Savings | revolut | tradfi | GBP | £254,000 | 4.25 | £10,795 |
| Jupiter Lend WSOL | jupiter | solana | jlWSOL | $72,935 | 5.60 | $4,085 |

Total deployed (latest snapshot 2026-05-03): **$3,649,367 USD + £254,000 GBP** (USD subtotal excludes Revolut). Annualised yield from APY × value: **~$135,043 USD + £10,795 GBP/year**.

Movement vs 2026-05-02 snapshot:
- Coinbase Earn $1,250,000 → $1,146,000 (−$104,000) — the one-day +$104K bump on 2026-05-02 has reverted; manual-entry artefact rather than a real deposit.
- Jupiter Lend USDT $261,637 → $257,478 (−$4,159).
- Lido stETH $268,664 → $277,476 (+$8,812) — ETH price drift.
- Coinbase APY 3.50 → 4.10; Lido APY 2.56 → 2.38 (DefiLlama refresh).

## Portfolio snapshots coverage
- 3,047 rows across 12 days (2026-04-23 to 2026-05-04)
- ~290 wallet snapshots per day on full days
- Note: historical portfolio snapshots (4,992 rows pre-wipe) are permanently lost

## Actual schema (verified 2026-04-23)
`yield_positions`: id, name, protocol, chain, token, token_balance, token_price, value_usd, apy, snapshot_at, metadata, created_at
`portfolio_snapshots`: id, wallet_id, total_value_usd, positions (jsonb), source, snapshot_at, created_at

## Known gotchas
- **APY populated** for the 2026-05-02 and 2026-05-03 snapshots via DefiLlama feed (forward-fill working). Earlier snapshots (2026-04-24 → 2026-05-01) still have NULL apy — historical rates are not back-filled.
- Coinbase $1.25M position is manual entry (CDP API cannot read balance). Query results will accurately show it only if manually maintained.
- Revolut GBP Savings is in GBP, all others in USD — cross-currency totals need FX conversion.
- **Schema drift corrected**: earlier page referenced `position_name`, `balance_usd`, `apy_pct`, `annualised_yield_usd`, `active` — none of these columns exist. Correct names: `name`, `value_usd`, `apy`. No `active` flag.

## Relevance to goals
- **$170K annualised yield** target — DB now shows ~$135,043 USD + £10,795 GBP/yr at current APYs (2026-05-03 snapshot). Gap to target: ~$35K USD/yr. Goal is now measurable.
- **Deploy 68 ETH, LDO→USDC, $200K off MEXC** — LDO not visible as a position; ETH appears via stETH ($268K). MEXC not represented.
- **EY tax conversation** — £26K difference conservative vs aggressive DeFi yield treatment.

## How to query
```sql
SELECT name, protocol, chain, token, value_usd, apy, snapshot_at
FROM yield_positions
ORDER BY snapshot_at DESC, value_usd DESC;
```

## Open questions
- APY only populated for the 2026-05-02 snapshot. Will the connector back-fill APY into earlier snapshots (2026-04-24 → 2026-05-01) or only forward-fill from now?
- Coinbase position bumped $1.146M → $1.25M on 2026-05-02 then reverted to $1.146M on 2026-05-03 — confirms the bump was a one-day manual-entry artefact, not a real deposit. What's the canonical balance?
- LDO position not visible — has LDO→USDC conversion already occurred?
- MEXC $200K not in positions — manual entry needed or connector gap?
- Multi-currency total: still $3.74M USD + £254K GBP face value. Need an FX rate column or USD-equivalent column to produce a single-currency total for the goal dashboard.
