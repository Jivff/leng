import { state, save } from '../store.js';
import { allItems, claudeNote, feedback } from '../content.js';
import { buildSession } from '../session.js';
import { globalMetrics } from '../metrics.js';
import { dueCards } from '../srs.js';
import { isDue } from '../assess.js';
import { LANGS, LANG_IDS } from '../model.js';
import { esc, on, go, meter, fmtDate } from '../ui.js';
import { setRun } from './session.js';

let minutes = null;

export function render(root) {
  const now = Date.now();
  const p = state.profile;
  const g = globalMetrics(state, now);
  const active = LANG_IDS.filter((l) => p.langs[l].status !== 'paused');
  if (minutes == null) {
    const left = Math.max(5, p.dailyMinutes - g.minutesToday);
    minutes = [5, 15, 30, 60].reduce((a, b) => (Math.abs(b - left) < Math.abs(a - left) ? b : a));
  }
  const s = buildSession({ state, items: allItems(), minutes, now });
  const note = claudeNote();
  const due = active.filter((l) => isDue(l, state.assessments, now));
  const graded = new Set(feedback().map((f) => f.submissionId));
  const unread = state.submissions.filter((x) => graded.has(x.id) && !x.seen).length;
  const hour = new Date().getHours();
  const syncLine = state.sync.token
    ? (state.sync.error ? `Sync problem: ${esc(state.sync.error)}` : `Last synced ${state.sync.lastSync ? `${fmtDate(state.sync.lastSync)} ${new Date(state.sync.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'never'}`)
    : 'Sync is off. <a href="#/settings">Set it up</a> to share progress between devices.';

  root.innerHTML = `
    <header class="top"><div><h1>${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</h1>
      <p class="muted">${g.streak ? `${g.streak}-day streak · ` : ''}${Math.round(g.minutesToday)} of ${p.dailyMinutes} min today</p></div>
      <a class="icon-btn" href="#/settings" aria-label="Settings">⚙</a></header>
    ${meter(g.minutesToday / p.dailyMinutes)}
    ${!p.onboarded ? `<section class="card accent"><h2>Welcome</h2><p>Check each language's status and level, tick the Rosetta Stone lessons you have already finished, then take a level check so the plan starts from your real level.</p>
      <div class="row"><a class="btn" href="#/languages">Set up languages</a><button class="btn ghost" data-act="dismiss">Done</button></div></section>` : ''}
    ${note?.text ? `<section class="card"><div class="eyebrow">Note from Claude${note.date ? ` · ${esc(note.date)}` : ''}</div><p>${esc(note.text)}</p></section>` : ''}
    ${unread ? `<a class="card link" href="#/languages/feedback"><span><strong>${unread} new correction${unread > 1 ? 's' : ''}</strong> on your writing and speaking</span><span class="chev">›</span></a>` : ''}
    ${due.map((l) => `<a class="card link" href="#/assess/${l}"><span>${LANGS[l].flag} <strong>${LANGS[l].name}</strong>: level check ${state.assessments.some((a) => a.lang === l) ? 'due (every 3 months)' : 'not taken yet'}</span><span class="chev">›</span></a>`).join('')}
    <section class="card">
      <h2>How much time do you have?</h2>
      <div class="chips">${[5, 15, 30, 60].map((m) => `<button class="chip ${m === minutes ? 'on' : ''}" data-act="min" data-m="${m}">${m} min</button>`).join('')}</div>
      <ul class="plain">
        <li><strong>${s.counts.reviews}</strong> reviews</li>
        <li><strong>${s.counts.fresh}</strong> new items</li>
        ${s.task ? `<li>${LANGS[s.task.lang].flag} ${s.task.minutes}-minute <strong>${s.task.skill}</strong> task</li>` : ''}
      </ul>
      ${s.queue.length || s.task ? '<button class="btn big" data-act="start">Start session</button>' : '<p class="muted">Nothing to study yet. Tick Rosetta Stone lessons or add items under Languages.</p>'}
    </section>
    <section class="card"><h2>Reviews waiting</h2>
      ${active.map((l) => `<div class="kv"><span>${LANGS[l].flag} ${LANGS[l].name} <span class="tag">${p.langs[l].status}</span></span><strong>${dueCards(state.langs[l], now).filter((c) => c.reps > 0).length}</strong></div>`).join('') || '<p class="muted">No active languages.</p>'}
    </section>
    <p class="muted small center">${syncLine}</p>`;

  const again = () => render(root);
  on(root, {
    min: (el) => { minutes = +el.dataset.m; again(); },
    start: () => { setRun(s); go('#/session'); },
    dismiss: async () => { p.onboarded = true; await save('profile'); again(); },
  });
}
