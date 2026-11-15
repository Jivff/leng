import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { review, retrievability, intervalFor, DAY } from '../js/fsrs.js';
import { parseCore, grammarItems, checkAnswer, defaultProfile, emptyLang, LANG_IDS, display } from '../js/model.js';
import { introduce, grade, dueCards, newQueue, formsFor, lessonId } from '../js/srs.js';
import { buildSession } from '../js/session.js';
import { langMetrics, globalMetrics, retention } from '../js/metrics.js';
import { planFor } from '../js/plan.js';
import { step, result, isDue } from '../js/assess.js';
import { mergeLang, syncAll } from '../js/sync.js';

const core = parseCore(fs.readFileSync(new URL('../content/core.tsv', import.meta.url), 'utf8'));
const grammar = JSON.parse(fs.readFileSync(new URL('../content/grammar.json', import.meta.url), 'utf8'));
const rosetta = JSON.parse(fs.readFileSync(new URL('../content/rosetta.json', import.meta.url), 'utf8'));
const assessBank = JSON.parse(fs.readFileSync(new URL('../content/assess.json', import.meta.url), 'utf8'));
const T0 = new Date('2026-01-10T09:00:00').getTime();
const mkState = () => ({ profile: defaultProfile(), langs: Object.fromEntries(LANG_IDS.map((l) => [l, emptyLang()])), assessments: [], submissions: [], inbox: {} });
const items = Object.fromEntries(LANG_IDS.map((l) => [l, [...core[l], ...grammarItems(l, grammar[l])]]));

test('content: every language has all 168 core rows, well formed', () => {
  for (const l of LANG_IDS) {
    assert.equal(core[l].length, 168, l);
    for (const it of core[l]) assert.ok(it.t && it.en && it.unit >= 1 && it.unit <= 20, it.id);
  }
  assert.ok(core.zh.every((i) => i.r && i.trad));
  assert.equal(core.es.find((i) => i.en === 'computer').latam, 'la computadora');
  assert.equal(display(core.es.find((i) => i.en === 'computer'), { esVariant: 'es' }), 'el ordenador');
  assert.equal(display(core.zh.find((i) => i.en === 'book'), { zhScript: 'trad' }), '書');
});

test('content: grammar clozes and assessment bank are complete', () => {
  for (const l of LANG_IDS) {
    for (const g of grammarItems(l, grammar[l])) assert.ok(g.cloze && g.q.includes('_____'), g.id);
    for (const L of ['A1', 'A2', 'B1', 'B2', 'C1']) {
      const rows = assessBank[l][L];
      assert.equal(rows.length, 5, `${l} ${L}`);
      for (const r of rows) { assert.ok(r.length >= 5 && new Set(r.slice(2, 5)).size === 3, `${l} ${L} ${r[1]}`); if (r[0] === 'r' || r[0] === 'l') assert.ok(r[5]); }
    }
  }
});

test('fsrs: intervals grow with success and shrink after a lapse', () => {
  let c = { reps: 0 }; let now = T0;
  ({ card: c } = review(c, 3, now));
  const first = c.due - now;
  assert.ok(first >= DAY);
  const ivs = [];
  for (let i = 0; i < 5; i++) { now = c.due; ({ card: c } = review(c, 3, now)); ivs.push(c.due - now); }
  for (let i = 1; i < ivs.length; i++) assert.ok(ivs[i] > ivs[i - 1]);
  const s = c.s; now = c.due;
  ({ card: c } = review(c, 1, now));
  assert.ok(c.s < s); assert.equal(c.lapses, 1); assert.ok(c.due - now < DAY);
  assert.ok(Math.abs(retrievability(intervalFor(50), 50) - 0.9) < 0.01);
});

test('answers: exact, close and wrong', () => {
  assert.equal(checkAnswer('El hombre', ['el hombre']), 'exact');
  assert.equal(checkAnswer('hombre', ['el hombre']), 'close');
  assert.equal(checkAnswer('agua', ['el agua']), 'close');
  assert.equal(checkAnswer('adios', ['adiós']), 'close');
  assert.equal(checkAnswer('uomo', ["l'uomo"]), 'close');
  assert.equal(checkAnswer('mujer', ['el hombre']), 'wrong');
  assert.equal(checkAnswer('書', ['书', '書']), 'exact');
  assert.equal(checkAnswer('¿Qué hora es?', ['¿Qué hora es?']), 'exact');
});

test('rosetta ticks release unit items; staggered forms', () => {
  const ls = emptyLang();
  assert.equal(newQueue(ls, items.es).covered.length, 0);
  ls.rs[lessonId(1, 1)] = { done: true, t: T0 }; ls.rs[lessonId(1, 2)] = { done: true, t: T0 };
  const q = newQueue(ls, items.es, { ahead: true });
  const unit1 = items.es.filter((i) => i.unit === 1).length;
  assert.equal(q.covered.length, Math.ceil(unit1 / 2));
  assert.ok(q.next.length > 0 && q.next[0].unit === 1);
  introduce(ls, q.covered[0], T0);
  assert.equal(Object.keys(ls.cards).length, formsFor(q.covered[0]).length);
  assert.equal(dueCards(ls, T0).length, 1);
  assert.equal(dueCards(ls, T0 + 5 * DAY).length, formsFor(q.covered[0]).length);
  assert.ok(formsFor(core.zh[4]).includes('hand'));
  assert.deepEqual(formsFor(core.es[8]), ['listen', 'speak']);
});

test('session fits the time budget and respects status', () => {
  const st = mkState();
  for (const l of ['ko', 'es', 'pt', 'zh']) for (let k = 1; k <= 4; k++) st.langs[l].rs[lessonId(1, k)] = { done: true, t: T0 };
  const s5 = buildSession({ state: st, items, minutes: 5, now: T0 });
  const s30 = buildSession({ state: st, items, minutes: 30, now: T0 });
  assert.ok(s5.estSecs <= 300 && s30.estSecs <= 1800);
  assert.ok(s30.queue.length > s5.queue.length);
  assert.equal(s5.task, null); assert.ok(s30.task);
  assert.ok(!s30.queue.some((x) => x.lang === 'de' || x.lang === 'it'), 'paused languages excluded');
  const n = (l) => s30.queue.filter((x) => x.lang === l).length;
  assert.ok(n('es') > n('ko'), 'active languages get more than the maintained one');
  // reviews take priority once cards are due
  for (const l of ['es', 'zh']) for (const it of items[l].slice(0, 40)) { introduce(st.langs[l], it, T0); for (const f of formsFor(it)) grade(st.langs[l], `${it.id}:${f}`, 3, { now: T0, ms: 8000 }); }
  const later = buildSession({ state: st, items, minutes: 5, now: T0 + 10 * DAY });
  assert.ok(later.counts.reviews > 0 && later.counts.fresh === 0);
  const swamped = buildSession({ state: st, items, minutes: 30, now: T0 + 10 * DAY });
  assert.equal(swamped.counts.fresh, 0, 'no new material while a review backlog exists');
  assert.ok(s30.counts.fresh <= 14, 'new items per day are capped');
});

test('metrics: learned, retention, streak, forecast', () => {
  const st = mkState(); const ls = st.langs.es;
  const five = items.es.slice(0, 5);
  five.forEach((it) => { introduce(ls, it, T0); grade(ls, `${it.id}:recognize`, 3, { now: T0, ms: 6000 }); });
  const t1 = T0 + 3 * DAY;
  five.forEach((it, i) => grade(ls, `${it.id}:recognize`, i === 0 ? 1 : 3, { now: t1, ms: 6000 }));
  const m = langMetrics('es', ls, items.es, { profile: st.profile, assessments: [], rosetta, now: t1 });
  assert.equal(m.learnedTotal, 5); assert.equal(m.masteredTotal, 0);
  assert.equal(m.retention.d7.n, 5); assert.equal(m.retention.d7.rate, 0.8);
  assert.equal(m.bySkill.reading.rate, 0.8);
  assert.equal(m.forecast.reduce((a, b) => a + b, 0) > 0, true);
  assert.equal(retention(ls.log, 0).n, 5, 'first exposures are not counted as reviews');
  const g = globalMetrics(st, t1);
  assert.equal(g.streak, 1); assert.equal(g.days7, 2); assert.equal(Math.round(g.minutesToday * 10), 5);
});

test('plan: milestones, maintain mode and pace', () => {
  const st = mkState();
  const m = langMetrics('es', st.langs.es, items.es, { profile: st.profile, assessments: [], rosetta, now: T0 });
  const p = planFor('es', st.profile, m, { now: T0, rosetta });
  assert.equal(p.mode, 'learn'); assert.deepEqual(p.milestones.map((x) => x.level), ['A2', 'B1', 'B2']);
  assert.ok(p.milestones[0].date < p.milestones[2].date && p.pace === 'starting');
  const zh = planFor('zh', st.profile, langMetrics('zh', st.langs.zh, items.zh, { profile: st.profile, rosetta, now: T0 }), { now: T0, rosetta });
  assert.ok(zh.milestones[0].hours > p.milestones[0].hours, 'Mandarin needs more hours per level');
  assert.equal(planFor('ko', st.profile, null, { now: T0 }).mode, 'maintain');
  assert.equal(planFor('de', st.profile, null, { now: T0 }).mode, 'paused');
  st.profile.langs.es.level = 'B2';
  assert.equal(planFor('es', st.profile, m, { now: T0 }).mode, 'maintain');
});

test('assessment staircase', () => {
  const h = (level, score) => ({ level, score, n: 5, listenOk: 1, listenN: 1 });
  assert.deepEqual(step([], 'B1'), { next: 'B1' });
  assert.deepEqual(step([], 'A0'), { next: 'A1' });
  assert.deepEqual(step([h('A2', 5)]), { next: 'B1' });
  assert.deepEqual(step([h('A2', 5), h('B1', 2)]), { done: true, level: 'A2' });
  assert.deepEqual(step([h('B1', 2)]), { next: 'A2' });
  assert.deepEqual(step([h('B1', 2), h('A2', 4)]), { done: true, level: 'A2' });
  assert.deepEqual(step([h('A1', 1)]), { done: true, level: 'A0' });
  assert.deepEqual(step([h('B2', 5), h('C1', 5)]), { done: true, level: 'C1' });
  const r = result('es', [h('A2', 5), h('B1', 2)], 'A2', { writing: 'A1', speaking: 'A2' }, T0);
  assert.equal(r.skills.reading, 'A2'); assert.equal(r.skills.writing, 'A1'); assert.equal(r.level, 'A2');
  assert.equal(isDue('es', [], T0), true);
  assert.equal(isDue('es', [r], T0 + 30 * DAY), false);
  assert.equal(isDue('es', [r], T0 + 91 * DAY), true);
});

// ---- sync against an in-memory fake of the GitHub API ----
function fakeGitHub() {
  const files = new Map(); let n = 0;
  const json = (status, body) => ({ status, ok: status < 300, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const api = async (url, opt = {}) => {
    const path = url.replace('https://api.github.com/repos/me/data', '');
    if (path === '') return json(200, { default_branch: 'main' });
    if (path.startsWith('/git/trees/')) return files.size ? json(200, { tree: [...files].map(([p, f]) => ({ path: p, type: 'blob', sha: f.sha })) }) : json(409, {});
    const p = path.replace('/contents/', '');
    if (opt.method === 'PUT') {
      const b = JSON.parse(opt.body); const cur = files.get(p);
      if (cur && cur.sha !== b.sha) return json(409, {});
      const sha = `sha${++n}`; files.set(p, { sha, text: Buffer.from(b.content, 'base64').toString('utf8') });
      return json(200, { content: { sha } });
    }
    return files.has(p) ? json(200, files.get(p).text) : json(404, {});
  };
  return { api, files };
}

test('sync: two devices merge reviews, ticks and read the Claude inbox', async () => {
  const gh = fakeGitHub();
  const cfg = () => ({ owner: 'me', repo: 'data', token: 't', shas: {}, dirty: {} });
  const A = mkState(); const B = mkState(); const ca = cfg(); const cb = cfg();
  const it = items.ko[0]; const it2 = items.ko[1];
  introduce(A.langs.ko, it, T0); grade(A.langs.ko, `${it.id}:recognize`, 3, { now: T0 });
  A.langs.ko.rs.u1l1 = { done: true, t: T0 }; A.profile.u = T0; A.profile.dailyMinutes = 45;
  await syncAll(A, ca, { fetchImpl: gh.api });
  assert.ok(gh.files.has('state/ko.json') && gh.files.has('profile.json'));
  const r = await syncAll(B, cb, { fetchImpl: gh.api });
  assert.equal(B.profile.dailyMinutes, 45); assert.equal(B.langs.ko.log.length, 1);
  assert.equal(r.pushed.length, 0, 'nothing to push after a clean pull');
  // both devices study offline, including the same card
  grade(A.langs.ko, `${it.id}:recognize`, 3, { now: T0 + 2 * DAY }); ca.dirty['lang:ko'] = true;
  introduce(B.langs.ko, it2, T0 + DAY); grade(B.langs.ko, `${it2.id}:recognize`, 4, { now: T0 + DAY });
  grade(B.langs.ko, `${it.id}:recognize`, 1, { now: T0 + DAY }); B.langs.ko.rs.u1l2 = { done: true, t: T0 + DAY }; cb.dirty['lang:ko'] = true;
  await syncAll(A, ca, { fetchImpl: gh.api });
  await syncAll(B, cb, { fetchImpl: gh.api });
  await syncAll(A, ca, { fetchImpl: gh.api });
  assert.equal(A.langs.ko.log.length, 4); assert.equal(B.langs.ko.log.length, 4);
  assert.deepEqual(A.langs.ko.cards, B.langs.ko.cards);
  assert.equal(A.langs.ko.cards[`${it.id}:recognize`].last, T0 + 2 * DAY, 'newest review of a card wins');
  assert.ok(A.langs.ko.rs.u1l2.done && B.langs.ko.rs.u1l1.done);
  // Claude writes feedback into the inbox
  gh.files.set('inbox/feedback.json', { sha: 'x1', text: JSON.stringify([{ submissionId: 's1', level: 'A2' }]) });
  const r2 = await syncAll(A, ca, { fetchImpl: gh.api });
  assert.deepEqual(r2.inbox, ['inbox/feedback.json']); assert.equal(A.inbox['inbox/feedback.json'][0].level, 'A2');
  assert.deepEqual(mergeLang(emptyLang(), null), emptyLang());
});
