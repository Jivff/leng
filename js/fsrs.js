// FSRS-5 spaced-repetition scheduler (default parameters), dependency-free.
// Ratings: 1 Again, 2 Hard, 3 Good, 4 Easy.
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5;
const FACTOR = 19 / 81;
export const DAY = 86400000;
export const TARGET_RETENTION = 0.9;
const MAX_INTERVAL = 365 * 3;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const d0 = (g) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

/** Probability of recall after `days` with stability `s`. */
export function retrievability(days, s) {
  if (!s) return 0;
  return Math.pow(1 + FACTOR * Math.max(0, days) / s, DECAY);
}

export function intervalFor(s, retention = TARGET_RETENTION) {
  const i = (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(i), 1, MAX_INTERVAL);
}

/**
 * Apply a rating to a card. Card fields used: s (stability, days), d (difficulty),
 * last (ms of last review), reps, lapses, state. Returns a new card object.
 */
export function review(card, g, now = Date.now()) {
  const c = { ...card };
  const first = !c.s;
  let r = null;
  if (first) {
    c.s = W[g - 1];
    c.d = d0(g);
  } else {
    const days = (now - c.last) / DAY;
    r = retrievability(days, c.s);
    if (days < 0.5) {
      c.s = c.s * Math.exp(W[17] * (g - 3 + W[18]));
    } else if (g === 1) {
      const sf = W[11] * Math.pow(c.d, -W[12]) * (Math.pow(c.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
      c.s = Math.min(sf, c.s);
    } else {
      const hard = g === 2 ? W[15] : 1;
      const easy = g === 4 ? W[16] : 1;
      c.s = c.s * (1 + Math.exp(W[8]) * (11 - c.d) * Math.pow(c.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy);
    }
    const dd = c.d - W[6] * (g - 3) * ((10 - c.d) / 9);
    c.d = clamp(W[7] * d0(4) + (1 - W[7]) * dd, 1, 10);
  }
  c.s = clamp(c.s, 0.01, 36500);
  c.reps = (c.reps || 0) + 1;
  if (g === 1) {
    if (!first) c.lapses = (c.lapses || 0) + 1;
    c.state = 'relearn';
    c.due = now + 10 * 60000; // comes back within the session, or next time
  } else {
    c.state = 'review';
    c.due = now + intervalFor(c.s) * DAY;
  }
  c.last = now;
  c.u = now;
  return { card: c, r };
}
