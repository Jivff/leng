// Card management on top of the FSRS scheduler. Pure functions over a language state
// { cards, log, rs, custom }.
import { review, retrievability } from './fsrs.js';
import { FORM_SKILL, DAY, uid } from './model.js';

export function formsFor(item) {
  if (item.type === 'grammar') return ['cloze'];
  // sentences train comprehension and speaking; words train recall, listening and written production
  if (item.type === 'sentence') return ['listen', 'speak'];
  const f = ['recognize', 'listen', 'produce'];
  if (item.lang === 'zh' && [...item.t].length <= 2) f.push('hand');
  return f;
}

/** Create the cards for an item. Forms are staggered over the following days. */
export function introduce(ls, item, now = Date.now()) {
  formsFor(item).forEach((form, i) => {
    const id = `${item.id}:${form}`;
    if (ls.cards[id]) return;
    ls.cards[id] = { id, item: item.id, form, state: 'new', due: now + i * DAY, intro: now, reps: 0, lapses: 0, u: now };
  });
}

export const isIntroduced = (ls, item) => formsFor(item).some((f) => ls.cards[`${item.id}:${f}`]);

export function dueCards(ls, now = Date.now()) {
  return Object.values(ls.cards).filter((c) => c.due <= now);
}

export function cardR(card, now = Date.now()) {
  return card.s ? retrievability((now - card.last) / DAY, card.s) : 0;
}

/** Grade a card and append to the review log. */
export function grade(ls, cardId, g, { now = Date.now(), ms = 0 } = {}) {
  const old = ls.cards[cardId];
  if (!old) return null;
  const { card, r } = review(old, g, now);
  ls.cards[cardId] = card;
  const entry = { id: uid(), t: now, c: cardId, f: card.form, k: FORM_SKILL[card.form], g, ms: Math.min(ms, 120000), n: old.reps ? 0 : 1 };
  if (r != null) entry.r = +r.toFixed(3);
  ls.log.push(entry);
  return card;
}

/** Log time spent on a non-card activity (reading task, free writing, assessment...). */
export function logTask(ls, skill, ms, what, now = Date.now()) {
  ls.log.push({ id: uid(), t: now, k: skill, ms, task: what });
}

export const lessonId = (unit, lesson) => `u${unit}l${lesson}`;
export function unitProgress(ls, unit, lessonsPerUnit = 4) {
  let n = 0;
  for (let l = 1; l <= lessonsPerUnit; l++) if (ls.rs[lessonId(unit, l)]?.done) n++;
  return n / lessonsPerUnit;
}

/**
 * Items not yet introduced, in the order they should be learned:
 * 1. material covered in Rosetta Stone (ticked lessons), 2. custom and Claude-provided items,
 * 3. if allowed, the next units ahead of Rosetta Stone.
 */
export function newQueue(ls, items, { ahead = false, lessonsPerUnit = 4 } = {}) {
  const fresh = items.filter((it) => !isIntroduced(ls, it));
  const byUnit = new Map();
  for (const it of items) { if (it.unit) { if (!byUnit.has(it.unit)) byUnit.set(it.unit, []); byUnit.get(it.unit).push(it); } }
  const released = new Set();
  for (const [unit, list] of byUnit) {
    const k = Math.ceil(list.length * unitProgress(ls, unit, lessonsPerUnit));
    list.slice(0, k).forEach((it) => released.add(it.id));
  }
  const covered = fresh.filter((it) => released.has(it.id));
  const extra = fresh.filter((it) => !it.unit);
  const next = ahead ? fresh.filter((it) => it.unit && !released.has(it.id)).sort((a, b) => a.unit - b.unit) : [];
  return { covered, extra, next, all: [...covered, ...extra, ...next] };
}
