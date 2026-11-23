// Two-tranche trend rider for the BTC race (cbBTC/USDC, 1-minute bars).
//
// Idea, in one paragraph: one-minute BTC prices are mostly noise — every
// fast trend-follower I tested on the dev window bled money to the ~26 bps
// round-trip cost (the EMA-cross house bot loses $114 there), while simply
// holding the window's rise made $32. So this bot rides the trend instead
// of chasing it: it buys half its cash on the first tradable bar, adds the
// other half only once the trailing 60-minute return confirms an uptrend
// (over +0.5%), and otherwise sits in cash. A 2% trailing stop from the
// highest close since entry caps the loss if the window turns down, and
// there is no re-entry after a stop-out: in a falling window the bot takes
// one small loss and waits, instead of bleeding on whipsaws.
//
//   - Entry, tranche 1: 50% of cash on the first tradable batch.
//   - Entry, tranche 2: the remaining cash when the close is more than
//     0.5% above the close 60 bars earlier, while still holding.
//   - Exit, whole position: the close falls 2% or more below the highest
//     close since entry (trailing stop). The exit is level-triggered, so a
//     sell the market refuses is retried on the next bar.
//   - Every comparison is exact bigint arithmetic on the bars' integer
//     prices, so two runs on the same data decide the same orders.
//   - No clock, no environment, no randomness: the bot is deterministic.

import { runBars, type BarsState, type Batch, type BuyInput, type OrderInput, type SellInput } from './vendor/makefun-bars.ts';

/** First tranche: half the cash (5,000 of 10,000 bps). */
const FIRST_TRANCHE_BPS = 5_000n;
/** Second tranche needs the close 0.5% above the close this many bars back. */
const MOMENTUM_BARS = 60;
/** Momentum threshold, in bps over the lookback close (50 = 0.5%). */
const MOMENTUM_BPS = 50n;
/** Trailing stop: sell when the close is this far below the peak close since entry. */
const TRAIL_BPS = 200n;
/** Orders refuse a fill more than 1% past the close they were decided on. */
const MAX_SLIPPAGE_BPS = 100;

/** Closes of the symbol, one per batch, oldest first. */
const closes: bigint[] = [];
/** Whether the first tranche has been sent (and not rejected). */
let firstSent = false;
/** Whether the second tranche has been sent (and not rejected). */
let secondSent = false;
/** Highest close since the entry; 0n while flat. */
let peakClose = 0n;
/** Counter for unique sell client ids (a refused sell is retried). */
let sellNo = 0;

function symbolOf(state: BarsState): string {
  return state.hello.symbols[0]!.symbol;
}

/** True when the latest close is more than MOMENTUM_BPS above the close MOMENTUM_BARS back. */
function momentumUp(): boolean {
  if (closes.length <= MOMENTUM_BARS) return false;
  const now = closes[closes.length - 1]!;
  const then = closes[closes.length - 1 - MOMENTUM_BARS]!;
  return now * 10_000n > then * (10_000n + MOMENTUM_BPS);
}

/** True when the latest close is TRAIL_BPS or more below the peak close since entry. */
function stopHit(): boolean {
  if (peakClose === 0n || closes.length === 0) return false;
  const now = closes[closes.length - 1]!;
  return now * 10_000n <= peakClose * (10_000n - TRAIL_BPS);
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    const symbol = symbolOf(state);

    // A refused order of ours is retried: clear its flag so the next bar sends it again.
    for (const fill of batch.fills) {
      if (fill.status !== 'rejected') continue;
      if (fill.client_id === 't1') firstSent = false;
      if (fill.client_id === 't2') secondSent = false;
    }

    for (const bar of batch.bars) {
      if (bar.symbol === symbol) closes.push(BigInt(bar.c));
    }
    if (closes.length === 0) return [];
    if (state.warmingUp) return [];

    const held = state.positions.get(symbol);
    const close = closes[closes.length - 1]!;

    if (held !== undefined) {
      if (close > peakClose) peakClose = close;
      if (stopHit()) {
        sellNo += 1;
        return [{ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: `x${sellNo}` } satisfies SellInput];
      }
      if (!secondSent && momentumUp()) {
        secondSent = true;
        const notional = state.cash;
        if (notional >= BigInt(state.hello.fees.min_notional_quote_units)) {
          return [{ side: 'buy', symbol, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: 't2' } satisfies BuyInput];
        }
      }
      return [];
    }

    // Flat and never entered: first tranche, half the cash, on the first tradable bar.
    if (!firstSent) {
      firstSent = true;
      peakClose = close;
      const notional = (state.cash * FIRST_TRANCHE_BPS) / 10_000n;
      if (notional >= BigInt(state.hello.fees.min_notional_quote_units)) {
        return [{ side: 'buy', symbol, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS, client_id: 't1' } satisfies BuyInput];
      }
      return [];
    }
    return [];
  },
});
