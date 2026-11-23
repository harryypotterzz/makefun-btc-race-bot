# Two-tranche trend rider — BTC race bot

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/harryypotterzz/makefun-btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/harryypotterzz/makefun-btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A long-only cbBTC/USDC bot for [make.fun's "Race a BTC trading bot live for 24 hours" bounty](https://make.fun/bounty/btc-race-24h-20261123-0511) (bars-replay/v1, 1-minute bars, $1,000 paper money).

## Strategy

One-minute BTC prices are mostly noise: on the published dev window every
fast trend-follower I tested bled money to the ~26 bps round-trip cost (the
EMA-cross house bot loses $114 there), while holding the window's rise made
$32. So this bot rides the trend instead of chasing it:

1. **Tranche 1** — buys 50% of cash on the first tradable bar.
2. **Tranche 2** — buys the remaining cash once the close is more than
   0.5% above the close 60 bars earlier (uptrend confirmed), while holding.
3. **Exit** — sells the whole position when the close falls 2% or more
   below the highest close since entry (trailing stop). No re-entry after
   a stop-out: in a falling window the bot takes one small loss and waits.

Local grade on the dev window (kit's `grade-local`, process driver):

- Net PnL **+$31.68 USDC**, 3 trades, max drawdown 1.98%, guardrails met.
- (Buy-and-hold makes +$32.17 and the momentum house bot +$34.94 on the
  same window; this bot's edge is the trailing stop, which caps the loss
  if the unseen race window falls instead of rising.)

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, standard library only
  plus the vendored shim).
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's
  `sdk/makefun-bars.ts` protocol shim.

## Run locally

From the unpacked kit directory:

```
node cli/makefun.mjs grade-local --kit . --bot <this directory> --driver process
```
