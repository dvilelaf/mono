---
layer: analysis
domain: finance
updated: 2026-05-04
sources:
  - page: ../../00-processing/crypto/yield-positions.md
---

# Yield gap — current yield → $170K target

## TL;DR
**Annualised yield ticked up to $135,043 USD/yr + £10,795 GBP/yr (was $131,753) on the 2026-05-03 snapshot — gap to $170K target narrowed to ~$35K/yr.** The bump is from APY refresh, not capital: total deployed actually fell to $3,649,366 USD (was $3,744,446) because the Coinbase Earn manual entry reverted $1.25M → $1.146M (a one-day artefact per [extract 2026-05-04](../../ROADMAP.md)). Coinbase APY raised 3.50% → 4.10% and Lido stETH dropped 2.56% → 2.375%; net result is still a higher annualised total.

## Last refreshed: 2026-05-04

### Latest positions (snapshot 2026-05-03 19:13)

| Position | Protocol | Token | Value | APY % | Annual yield | Δ vs 2026-05-02 |
|---|---|---|---|---|---|---|
| Coinbase Earn (Stablecoins) | coinbase | USDC | $1,146,000 | 4.10 | $46,986 | **+$3,236** (value −$104K, APY +0.60) |
| Steakhouse Prime Instant | morpho | steakUSDC | $680,466 | 3.68 | $25,041 | +$439 |
| Staked Ethena USDe | ethena | sUSDe | $506,179 | 3.22 | $16,275 | +$218 |
| Savings USDS | sky | sUSDS | $445,784 | 3.65 | $16,271 | 0 |
| Lido Staked ETH | lido | stETH | $277,476 | 2.375 | $6,590 | −$279 (value +$8,812, APY −0.185) |
| Syrup USDT | maple | syrupUSDT | $263,049 | 4.54 | $11,954 | +$30 |
| Jupiter Lend USDT | jupiter | jlUSDT | $257,478 | 3.05 | $7,841 | −$368 |
| Jupiter Lend WSOL | jupiter | jlWSOL | $72,935 | 5.60 | $4,085 | +$19 |
| **USD subtotal** | | | **$3,649,366** | — | **$135,043** | **+$3,290** |
| Revolut GBP Savings | revolut | GBP | £254,000 | 4.25 | £10,795 | 0 |

Note: Revolut GBP Savings carries a 4.25% APY for £10,795/yr but is denominated in GBP — single-currency total still requires FX conversion.

### Yield-to-target

| Metric | Value |
|---|---|
| Current annualised yield (USD) | $135,043 |
| Target | $170,000 |
| **Gap** | **~$34,957 USD/yr** |

Weighted-average USD-portfolio APY ~3.70% (was 3.52%). To close the gap at that rate, need ~**$945K** more deployed capital — or higher-APY rotation of existing positions.

**What changed vs prior refresh (2026-05-03):**
- New snapshot 2026-05-03; APY now populated on both 2026-05-02 AND 2026-05-03 snapshots per [yield-positions.md](../../00-processing/crypto/yield-positions.md).
- Coinbase Earn manual entry reverted $1.25M → $1.146M (−$104K). Per extract job, this is a one-day artefact of the manual-entry source — not a withdrawal. Sharpens the [coinbase-balance-manual](../../20-synthesis/blockers/coinbase-balance-manual.md) blocker: day-only blips are propagating into yield totals.
- Coinbase APY raised 3.50% → 4.10% via DefiLlama feed (prior 3.50% had been flagged as a manual default).
- Lido stETH APY fell 2.56% → 2.375%.
- Annualised yield USD subtotal $131,753 → $135,043 (+$3,290) despite −$95K in deployed capital — APY refresh dominated.

## Method
```sql
-- Schema note: no annualised_yield_usd column; no active column; apy is %, value_usd is USD
SELECT name, protocol, token, value_usd, apy,
       ROUND((value_usd * apy / 100)::numeric, 0) AS annual_yield_usd
FROM yield_positions
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM yield_positions)
ORDER BY value_usd DESC;

-- USD-only annualised yield total (excludes GBP face-value position)
SELECT ROUND(SUM(value_usd * apy / 100)::numeric, 0) AS annual_yield_usd
FROM yield_positions
WHERE snapshot_at = (SELECT MAX(snapshot_at) FROM yield_positions)
  AND token <> 'GBP';
```

## Interpretation framework
- **Gap closes with idle capital (68 ETH, LDO, $200K MEXC)**: now the primary lever. At a conservative 4% APY, $945K more deployed = $38K/yr — closes the gap with margin.
- **Gap doesn't close**: rotate into higher-APY positions (Jupiter WSOL 5.60%, Syrup 4.54%, Coinbase 4.10% are highest in current book) or accept lower target.
- **Tax treatment changes economics**: EY conversation (£26K conservative vs aggressive) may dwarf the $35K nominal gap.

## Open questions
- APY now populated for 2026-05-02 and 2026-05-03 snapshots; earlier 5 snapshots (2026-04-24 → 2026-05-01) still NULL — back-fill or accept forward-only series?
- Coinbase $1.146M ↔ $1.25M oscillation between snapshots: confirm canonical balance with the user. Until resolved, $135K headline yield carries ±~$4K wobble per snapshot just from this one position.
- 68 ETH, LDO, $200K MEXC — still not visible as positions. Confirm wallet/exchange locations and add manual entries if connector can't reach them.
- Multi-currency total: GBP face-value position needs an FX rate column for a single-currency dashboard.
- Lido stETH APY dropped 2.56% → 2.375% in one day — is that a real ETH staking yield move or a feed artefact?

## Links up
- blocks goal: [finance-yield-170k](../../20-synthesis/goals/finance-yield-170k.md)
