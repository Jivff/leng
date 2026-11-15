// KPIs for the dashboard, computed from the review log, cards, Rosetta ticks and assessments.
import { LANG_IDS, SKILLS, DAY, dayKey, lv, LEVELS } from './model.js';
import { formsFor, unitProgress } from './srs.js';

export const MASTERED_DAYS = 21;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const isReview = (e) => e.c && !e.n; // a graded card that was not its first exposure

export function retention(log, since, filter = () => true) {
  const xs = log.filter((e) => isReview(e) && e.t >= since && filter(e));
  return { n: xs.length, rate: xs.length ? xs.filter((e) => e.g > 1).length / xs.length : null };
}

export function langMetrics(lang, ls, items, { profile, assessments = [], rosetta, now = Date.now() }) {
  const cards = Object.values(ls.cards);
  const byItem = new Map();
  for (const c of cards) { if (!byItem.has(c.item)) byItem.set(c.item, []); byItem.get(c.item).push(c); }
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const learned = { vocab: 0, sentence: 0, grammar: 0 };
  const mastered = { vocab: 0, sentence: 0, grammar: 0 };
  for (const [id, cs] of byItem) {
    const it = itemMap.get(id); if (!it) continue;
    if (cs.some((c) => c.reps > 0)) learned[it.type]++;
    if (cs.length === formsFor(it).length && cs.every((c) => (c.s || 0) >= MASTERED_DAYS)) mastered[it.type]++;
  }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const cur = profile.langs[lang];
  const nextLevel = LEVELS[Math.min(lv(cur.level) + 1, LEVELS.length - 1)];
  const syllabus = items.filter((i) => lv(i.level) <= lv(nextLevel));
  const syllabusDone = syllabus.filter((i) => (byItem.get(i.id) || []).some((c) => c.reps > 0)).length;

  const units = (rosetta?.levels?.[lang] || 0) * 4;
  const lpu = rosetta?.lessonsPerUnit || 4;
  let lessonsDone = 0, unitsDone = 0; const rsUnits = {};
  for (let u = 1; u <= units; u++) { const p = unitProgress(ls, u, lpu); rsUnits[u] = p; lessonsDone += p * lpu; if (p === 1) unitsDone++; }

  const sod = startOfDay(now);
  const dueNow = cards.filter((c) => c.due <= now).length;
  const overdue = cards.filter((c) => c.due < sod && c.reps > 0).length;
  const forecast = Array.from({ length: 30 }, () => 0);
  for (const c of cards) { const d = Math.max(0, Math.floor((c.due - sod) / DAY)); if (d < 30) forecast[d]++; }

  const ret = { d7: retention(ls.log, now - 7 * DAY), d30: retention(ls.log, now - 30 * DAY), d90: retention(ls.log, now - 90 * DAY) };
  const bySkill = Object.fromEntries(SKILLS.map((k) => [k, retention(ls.log, now - 30 * DAY, (e) => e.k === k)]));
  const forms = [...new Set(ls.log.filter((e) => e.f).map((e) => e.f))];
  const byForm = Object.fromEntries(forms.map((f) => [f, retention(ls.log, now - 30 * DAY, (e) => e.f === f)]));
  // retention check: reviews of well-established cards (predicted retrievability recorded, interval over 3 weeks)
  const mature = ls.log.filter((e) => isReview(e) && e.t >= now - 90 * DAY && e.r != null && e.r < 0.93 && ls.cards[e.c] && (ls.cards[e.c].s || 0) >= 14);
  const matureRate = mature.length ? mature.filter((e) => e.g > 1).length / mature.length : null;

  const leeches = cards.filter((c) => (c.lapses || 0) >= 3).sort((a, b) => b.lapses - a.lapses).slice(0, 15)
    .map((c) => ({ card: c, item: itemMap.get(c.item) })).filter((x) => x.item);

  const minutesByDay = {};
  const timeBySkill = Object.fromEntries(SKILLS.map((k) => [k, 0]));
  for (const e of ls.log) {
    if (e.t < now - 90 * DAY) continue;
    const k = dayKey(e.t);
    minutesByDay[k] = (minutesByDay[k] || 0) + (e.ms || 0) / 60000;
    if (e.t >= now - 30 * DAY && timeBySkill[e.k] != null) timeBySkill[e.k] += (e.ms || 0) / 60000;
  }
  let m28 = 0;
  for (let i = 0; i < 28; i++) m28 += minutesByDay[dayKey(now - i * DAY)] || 0;
  const firstLog = ls.log.length ? ls.log[0].t : now;
  const span = Math.min(28, Math.max(1, Math.ceil((now - firstLog) / DAY)));

  const history = assessments.filter((a) => a.lang === lang).sort((a, b) => a.t - b.t);
  return {
    lang, learned, mastered, learnedTotal: sum(learned), masteredTotal: sum(mastered),
    cardsTotal: cards.length, syllabus: { done: syllabusDone, total: syllabus.length, level: nextLevel },
    rs: { lessonsDone, lessonsTotal: units * lpu, unitsDone, unitsTotal: units }, rsUnits,
    dueNow, overdue, forecast, retention: ret, bySkill, byForm, matureRate, matureN: mature.length, leeches,
    minutesByDay, timeBySkill, avgMinutes: m28 / span, daysOfData: Math.ceil((now - firstLog) / DAY),
    history, lastAssessment: history[history.length - 1] || null,
  };
}

/** Totals across languages: streak, time today, time per day. */
export function globalMetrics(state, now = Date.now()) {
  const byDay = {}; const byLangToday = {};
  const today = dayKey(now);
  for (const lang of LANG_IDS) for (const e of state.langs[lang].log) {
    const k = dayKey(e.t); const m = (e.ms || 0) / 60000;
    byDay[k] = (byDay[k] || 0) + m;
    if (k === today) byLangToday[lang] = (byLangToday[lang] || 0) + m;
  }
  let streak = 0;
  for (let i = 0; ; i++) {
    const k = dayKey(now - i * DAY);
    if (byDay[k] > 0) streak++; else if (i > 0) break; // today may still be empty
    if (i > 3650) break;
  }
  let days7 = 0;
  for (let i = 0; i < 7; i++) if (byDay[dayKey(now - i * DAY)] > 0) days7++;
  const last30 = Array.from({ length: 30 }, (_, i) => byDay[dayKey(now - (29 - i) * DAY)] || 0);
  return { streak, days7, minutesToday: byDay[today] || 0, byLangToday, last30, byDay };
}

/** Time and accuracy per skill over the last 14 days; picks the skill that most needs work. */
export function skillBalance(state, now = Date.now()) {
  const since = now - 14 * DAY;
  const out = Object.fromEntries(SKILLS.map((k) => [k, { minutes: 0, n: 0, ok: 0 }]));
  for (const lang of LANG_IDS) for (const e of state.langs[lang].log) {
    if (e.t < since || !out[e.k]) continue;
    out[e.k].minutes += (e.ms || 0) / 60000;
    if (isReview(e)) { out[e.k].n++; if (e.g > 1) out[e.k].ok++; }
  }
  const total = SKILLS.reduce((s, k) => s + out[k].minutes, 0) || 1;
  let weakest = 'writing', best = Infinity;
  // rotate deterministically when there is no data yet
  if (total === 1) weakest = SKILLS[Math.floor(now / DAY) % 4];
  else for (const k of SKILLS) {
    const acc = out[k].n ? out[k].ok / out[k].n : 0.7;
    const score = acc * 0.5 + (out[k].minutes / total) * 2; // low accuracy or low share => weak
    out[k].acc = out[k].n ? acc : null; out[k].share = out[k].minutes / total;
    if (score < best) { best = score; weakest = k; }
  }
  return { skills: out, weakest };
}
