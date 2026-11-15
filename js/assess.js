// Level evaluation: adaptive staircase over CEFR-graded question blocks, plus can-do
// self-rating for writing and speaking until Claude grades the submitted samples.
import { LEVELS, DAY } from './model.js';

export const TEST_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
export const INTERVAL_DAYS = 90;
export const PASS = 0.8;

export const CAN_DO = {
  writing: {
    A1: 'I can write a short postcard and fill in a form with my personal details.',
    A2: 'I can write short, simple notes and a simple personal message, for example thanking someone.',
    B1: 'I can write simple connected text about familiar topics and describe experiences and impressions.',
    B2: 'I can write clear, detailed text on many subjects and argue for or against a point of view.',
    C1: 'I can write well-structured text on complex subjects in an appropriate style.',
  },
  speaking: {
    A1: 'I can use simple phrases to describe where I live and people I know, and ask basic questions.',
    A2: 'I can handle short social exchanges and describe my family, job and daily routine in simple terms.',
    B1: 'I can deal with most travel situations and join conversations on familiar topics unprepared.',
    B2: 'I can talk with native speakers fairly fluently and explain my viewpoint on a topical issue.',
    C1: 'I can express myself fluently and spontaneously, and use the language flexibly for social and professional purposes.',
  },
};
export const PROMPTS = {
  writing: {
    A1: 'Introduce yourself in 4 to 5 sentences: name, where you live, your job, what you like.',
    A2: 'Describe what you did last weekend in 6 to 8 sentences.',
    B1: 'Write about a trip or experience you remember well: what happened, how you felt, and why it mattered (about 120 words).',
    B2: 'Is working from home better than working in an office? Give your opinion with arguments for and against (about 180 words).',
    C1: 'Discuss how technology is changing the way people learn, weighing benefits and risks (about 250 words).',
  },
  speaking: {
    A1: 'Say who you are, where you are from and what you do.',
    A2: 'Describe your typical day from morning to evening.',
    B1: 'Talk for one minute about a film, book or series you enjoyed and why.',
    B2: 'Talk for two minutes about the advantages and disadvantages of living in a big city.',
    C1: 'Talk for two minutes about a current issue you care about, presenting several perspectives.',
  },
};

export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Turn a bank row into a question with shuffled options. */
export function toQuestion(row, rnd) {
  const [kind, q, correct, w1, w2, extra] = row;
  return { kind, q, options: shuffle([correct, w1, w2], rnd), correct, extra };
}

/**
 * Staircase. history: [{level, score, n, listenOk, listenN}].
 * Returns { next: level } or { done: true, level }.
 */
export function step(history, start = 'A1') {
  const clamp = (l) => TEST_LEVELS[Math.min(TEST_LEVELS.length - 1, Math.max(0, TEST_LEVELS.indexOf(l)))];
  if (!history.length) return { next: clamp(TEST_LEVELS.includes(start) ? start : 'A1') };
  const passed = (l) => history.some((h) => h.level === l && h.score / h.n >= PASS);
  const failed = (l) => history.some((h) => h.level === l && h.score / h.n < PASS);
  const last = history[history.length - 1];
  const i = TEST_LEVELS.indexOf(last.level);
  if (passed(last.level)) {
    const up = TEST_LEVELS[i + 1];
    if (!up || failed(up)) return { done: true, level: last.level };
    return { next: up };
  }
  const down = TEST_LEVELS[i - 1];
  if (!down) return { done: true, level: 'A0' };
  if (passed(down)) return { done: true, level: down };
  return { next: down };
}

/** Final record from the staircase history and the can-do self-ratings. */
export function result(lang, history, level, self, now = Date.now()) {
  const lN = history.reduce((s, h) => s + (h.listenN || 0), 0);
  const lOk = history.reduce((s, h) => s + (h.listenOk || 0), 0);
  const down = (l) => LEVELS[Math.max(0, LEVELS.indexOf(l) - 1)];
  const listening = lN && lOk / lN < 0.5 ? down(level) : level;
  const skills = { reading: level, listening, writing: self?.writing || down(level), speaking: self?.speaking || down(level) };
  const idx = Object.values(skills).map((l) => LEVELS.indexOf(l));
  const overall = LEVELS[Math.round(idx.reduce((a, b) => a + b, 0) / idx.length)];
  return { lang, t: now, level: overall, skills, history, self: true, u: now };
}

export function nextDue(lang, assessments) {
  const last = assessments.filter((a) => a.lang === lang).sort((a, b) => b.t - a.t)[0];
  return last ? last.t + INTERVAL_DAYS * DAY : 0;
}
export const isDue = (lang, assessments, now = Date.now()) => nextDue(lang, assessments) <= now;
