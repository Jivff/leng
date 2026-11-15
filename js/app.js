import { state, load, save, onSave } from './store.js';
import { loadContent, allItems, feedback, content } from './content.js';
import { syncAll } from './sync.js';
import { langMetrics, globalMetrics } from './metrics.js';
import { LANG_IDS, LEVELS } from './model.js';
import { $, $$, toast } from './ui.js';
import * as today from './views/today.js';
import * as session from './views/session.js';
import * as dashboard from './views/dashboard.js';
import * as languages from './views/languages.js';
import * as assessView from './views/assess.js';
import * as plan from './views/plan.js';
import * as library from './views/library.js';
import * as settings from './views/settings.js';

const routes = { today, session, dashboard, languages, assess: assessView, plan, library, settings };
const main = $('#main');

function render() {
  const [name, ...params] = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  const view = routes[name] || today;
  document.body.classList.toggle('immersive', name === 'session' || name === 'assess');
  $$('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#/${routes[name] ? name : 'today'}`));
  main.innerHTML = '';
  const root = document.createElement('div'); root.className = 'view';
  main.appendChild(root);
  view.render(root, params);
  window.scrollTo(0, 0);
}
window.addEventListener('leng:render', render);

/** Apply Claude's grades for assessment samples to the stored assessment and profile. */
function applyFeedback() {
  let changed = false;
  for (const f of feedback()) {
    const sub = state.submissions.find((s) => s.id === f.submissionId);
    if (!sub || !sub.assessment || !LEVELS.includes(f.level)) continue;
    const a = state.assessments.find((x) => x.id === sub.assessment);
    const skill = sub.kind;
    if (!a || a.graded?.[skill]) continue;
    a.skills[skill] = f.level; a.graded = { ...(a.graded || {}), [skill]: true }; a.u = Date.now();
    const idx = Object.values(a.skills).map((l) => LEVELS.indexOf(l));
    a.level = LEVELS[Math.round(idx.reduce((x, y) => x + y, 0) / idx.length)];
    const latest = state.assessments.filter((x) => x.lang === a.lang).sort((x, y) => y.t - x.t)[0];
    if (latest === a) { state.profile.langs[a.lang].skills = { ...a.skills }; state.profile.langs[a.lang].level = a.level; }
    changed = true;
  }
  return changed;
}

/** Snapshot of the KPIs, written to the data repository for the scheduled Claude task. */
function summary() {
  const items = allItems(); const now = Date.now();
  const langs = {};
  for (const l of LANG_IDS) {
    const m = langMetrics(l, state.langs[l], items[l], { profile: state.profile, assessments: state.assessments, rosetta: content.rosetta, now });
    langs[l] = { status: state.profile.langs[l].status, level: state.profile.langs[l].level, target: state.profile.langs[l].target, skills: state.profile.langs[l].skills,
      learned: m.learned, mastered: m.mastered, rosetta: m.rs, dueNow: m.dueNow, overdue: m.overdue, retention: m.retention, retentionBySkill: m.bySkill, retentionByForm: m.byForm,
      avgMinutesPerDay: +m.avgMinutes.toFixed(1), minutesBySkill30d: m.timeBySkill,
      leeches: m.leeches.map((x) => ({ item: x.item.t, en: x.item.en, form: x.card.form, lapses: x.card.lapses })) };
  }
  const g = globalMetrics(state, now);
  return { generated: new Date(now).toISOString(), dailyMinutes: state.profile.dailyMinutes, streak: g.streak, daysStudiedLast7: g.days7, langs };
}

let syncing = false; let timer = null;
export async function syncNow({ quiet = true } = {}) {
  const cfg = state.sync;
  if (!cfg.token || !cfg.owner || !cfg.repo) { if (!quiet) toast('Set up sync in Settings first.'); return null; }
  if (syncing) return null;
  syncing = true; document.body.classList.add('syncing');
  try {
    let res;
    try { res = await syncAll(state, cfg, { summary }); } catch (e) {
      if (!e.conflict) throw e;
      cfg.shas = {}; res = await syncAll(state, cfg, { summary });
    }
    const fb = applyFeedback();
    await save([...new Set([...res.changedKeys, 'inbox'])], { local: true });
    if (fb) await save(['assessments', 'profile']);
    cfg.error = null;
    if (!quiet) toast(`Synced: ${res.pulled.length} pulled, ${res.pushed.length} pushed${res.inbox.length ? `, ${res.inbox.length} new from Claude` : ''}.`);
    if ((res.pulled.length || res.inbox.length) && !/session|assess/.test(location.hash)) render();
    return res;
  } catch (e) {
    cfg.error = e.message; if (!quiet) toast(e.message, 5000); return null;
  } finally { syncing = false; document.body.classList.remove('syncing'); }
}
window.addEventListener('leng:sync', () => syncNow({ quiet: false }));
onSave(() => { clearTimeout(timer); timer = setTimeout(() => syncNow(), 15000); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') syncNow();
  else if (Date.now() - (state.sync.lastSync || 0) > 10 * 60000) syncNow();
});

(async function start() {
  await load();
  try { await loadContent(); } catch {
    main.innerHTML = '<div class="view"><div class="card">Could not load the lesson content. Check your connection and reload.</div></div>'; return;
  }
  window.addEventListener('hashchange', render);
  render();
  syncNow();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
