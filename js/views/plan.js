// Long-term plan per language.
import { state } from '../store.js';
import { content, itemsFor, claudePlan } from '../content.js';
import { langMetrics } from '../metrics.js';
import { planFor } from '../plan.js';
import { nextDue } from '../assess.js';
import { LANGS, LANG_IDS, EQUIV } from '../model.js';
import { esc, fmtDate, fmtMonth } from '../ui.js';

export function render(root) {
  const now = Date.now(); const p = state.profile;
  const cp = claudePlan();
  const cards = LANG_IDS.map((lang) => {
    const m = langMetrics(lang, state.langs[lang], itemsFor(lang), { profile: p, assessments: state.assessments, rosetta: content.rosetta, now });
    const plan = planFor(lang, p, m, { now, rosetta: content.rosetta, inboxPlan: cp });
    const eq = EQUIV[lang] || {};
    const due = nextDue(lang, state.assessments);
    if (plan.mode === 'paused') return `<section class="card"><div class="kv"><h2>${LANGS[lang].flag} ${LANGS[lang].name}</h2><span class="pill muted">Paused</span></div><p class="muted small">Set it to active under Languages to start a plan.</p></section>`;
    return `<section class="card">
      <div class="kv"><h2>${LANGS[lang].flag} ${LANGS[lang].name}</h2><span class="pill ${plan.pace === 'behind' || plan.pace === 'slipping' ? 'bad' : plan.pace === 'starting' ? 'muted' : 'good'}">${plan.mode === 'maintain' ? 'Maintain' : 'Learn'} · ${plan.pace}</span></div>
      <p class="small">About <strong>${Math.round(plan.appMin)} min/day</strong> here${plan.rsMin ? ` plus ${Math.round(plan.rsMin)} min of Rosetta Stone` : ''}.</p>
      ${plan.mode === 'learn' ? `<ol class="timeline"><li class="now"><strong>${plan.level}</strong> ${eq[plan.level] ? `<span class="muted">${eq[plan.level]}</span>` : ''}<span class="muted small">today</span></li>
        ${plan.milestones.map((ms) => `<li><strong>${ms.level}</strong> ${eq[ms.level] ? `<span class="muted">${eq[ms.level]}</span>` : ''}<span class="muted small">${fmtMonth(ms.date)} · about ${ms.hours} h more${ms.paceDate ? ` · at current pace ${fmtMonth(ms.paceDate)}` : ''}</span></li>`).join('')}</ol>`
    : `<p>${plan.reached && p.langs[lang].status !== 'maintain' ? `Target ${plan.target} reached. ` : ''}Holding <strong>${plan.level}</strong>: reviews at widening intervals, no new-material quota, and a longer reading, listening or speaking task in rotation.</p>`}
      ${plan.focus.length ? `<h3>This week</h3><ul>${plan.focus.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${cp[lang]?.note ? `<p class="muted small">Claude: ${esc(cp[lang].note)}</p>` : ''}
      <p class="muted small">${due ? `Next level check: ${due <= now ? 'due now' : fmtDate(due)}` : 'Take a level check to anchor this plan.'} <a href="#/assess/${lang}">Open</a></p>
    </section>`;
  }).join('');
  root.innerHTML = `<header class="top"><h1>Plan</h1></header>
    <p class="muted small">Dates assume ${p.dailyMinutes} min/day in this app and ${p.rosettaMinutes} min/day of Rosetta Stone, split across active languages. They are estimates from typical study hours per level, corrected at each level check.</p>${cards}`;
}
