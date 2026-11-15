// Builds a study session that fits the minutes available.
import { dueCards, cardR, newQueue } from './srs.js';
import { FORM_SECS, LANG_IDS, DAY, dayKey } from './model.js';
import { skillBalance } from './metrics.js';

const NEW_SECS = 25;
const WEIGHT = { active: 1, maintain: 0.4, paused: 0 };

export function buildSession({ state, items, minutes, now = Date.now(), lessonsPerUnit = 4 }) {
  const profile = state.profile;
  const langs = LANG_IDS.filter((l) => profile.langs[l]?.status !== 'paused');
  let budget = minutes * 60;
  const wantTask = minutes >= 15;
  const taskSecs = wantTask ? Math.round(budget * 0.25) : 0;
  const cardBudget = budget - taskSecs;
  const reviewBudget = minutes <= 5 ? cardBudget : Math.round(cardBudget * 0.7);

  // 1. reviews: most forgotten first
  const due = [];
  for (const lang of langs) for (const c of dueCards(state.langs[lang], now)) if (c.reps > 0) due.push({ lang, card: c, r: cardR(c, now) });
  due.sort((a, b) => a.r - b.r);
  const reviews = [];
  let used = 0;
  let backlog = false; // more reviews waiting than this session can hold: no new material today
  for (const x of due) {
    const secs = FORM_SECS[x.card.form] || 12;
    if (used + secs > reviewBudget) { backlog = true; break; }
    reviews.push({ kind: 'review', lang: x.lang, cardId: x.card.id });
    used += secs;
  }

  // 2. pending first reviews of already-introduced items (staggered forms), then brand-new items
  const fresh = [];
  const today = dayKey(now);
  if (minutes > 5 || reviews.length === 0) {
    const scale = Math.max(0.5, profile.dailyMinutes / 30);
    const order = [...langs].sort((a, b) => WEIGHT[profile.langs[b].status] - WEIGHT[profile.langs[a].status]);
    const queues = {};
    for (const lang of order) {
      const ls = state.langs[lang];
      const st = profile.langs[lang].status;
      const pending = dueCards(ls, now).filter((c) => c.reps === 0).map((c) => ({ kind: 'review', lang, cardId: c.id, secs: FORM_SECS[c.form] || 12 }));
      const introducedToday = new Set(Object.values(ls.cards).filter((c) => dayKey(c.intro) === today).map((c) => c.item)).size;
      const cap = Math.max(0, Math.round((st === 'active' ? 4 : 2) * scale) - introducedToday);
      const q = newQueue(ls, items[lang] || [], { ahead: st === 'active' && profile.ahead, lessonsPerUnit });
      const news = backlog ? [] : q.all.slice(0, cap).map((it) => ({ kind: 'new', lang, itemId: it.id, secs: NEW_SECS }));
      queues[lang] = [...pending, ...news];
    }
    // weighted round robin
    let progress = true;
    const credit = Object.fromEntries(order.map((l) => [l, 0]));
    while (progress && used < cardBudget) {
      progress = false;
      for (const lang of order) {
        credit[lang] += WEIGHT[profile.langs[lang].status];
        while (credit[lang] >= 1 && queues[lang].length) {
          const x = queues[lang][0];
          if (used + x.secs > cardBudget) { queues[lang] = []; break; }
          queues[lang].shift(); credit[lang] -= 1; used += x.secs; fresh.push(x); progress = true;
        }
        if (queues[lang].length) progress = progress || credit[lang] < 1;
      }
      if (order.every((l) => !queues[l].length)) break;
    }
  }

  // group by language to limit interference; language with most work first
  const all = [...reviews, ...fresh];
  const count = {};
  all.forEach((x) => { count[x.lang] = (count[x.lang] || 0) + 1; });
  const queue = Object.keys(count).sort((a, b) => count[b] - count[a]).flatMap((l) => [...all.filter((x) => x.lang === l && x.kind === 'review'), ...all.filter((x) => x.lang === l && x.kind === 'new')]);

  // 3. one longer skill task aimed at the weakest skill
  let task = null;
  if (wantTask && langs.length) {
    const bal = skillBalance(state, now);
    const recent = (l) => state.langs[l].log.filter((e) => e.t > now - 7 * DAY).reduce((s, e) => s + (e.ms || 0), 0) / (WEIGHT[profile.langs[l].status] || 1);
    const lang = [...langs].sort((a, b) => recent(a) - recent(b))[0];
    task = { lang, skill: bal.weakest, minutes: Math.max(4, Math.round(taskSecs / 60)) };
  }
  return { minutes, queue, task, estSecs: used + taskSecs, counts: { reviews: all.filter((x) => x.kind === 'review').length, fresh: all.filter((x) => x.kind === 'new').length } };
}
