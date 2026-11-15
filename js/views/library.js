// Library: curated online resources per language, filtered by skill and level.
import { state } from '../store.js';
import { resourcesFor, resourceFits } from '../content.js';
import { LANGS, LANG_IDS } from '../model.js';
import { esc, on } from '../ui.js';

const SK = { '': 'All', L: 'Listening', R: 'Reading', W: 'Writing', S: 'Speaking', G: 'Grammar', V: 'Vocabulary' };
let lang = null; let skill = ''; let mine = true;

export function render(root) {
  const p = state.profile;
  if (!lang) lang = LANG_IDS.find((l) => p.langs[l].status === 'active') || 'ko';
  const level = p.langs[lang].level;
  const all = resourcesFor(lang);
  const list = all.filter((r) => (!skill || r.skills.includes(skill)) && (!mine || resourceFits(r, level, '')));
  root.innerHTML = `<header class="top"><h1>Library</h1></header>
    <div class="chips scroll">${LANG_IDS.map((l) => `<button class="chip ${l === lang ? 'on' : ''}" data-act="lang" data-v="${l}">${LANGS[l].flag} ${LANGS[l].name}</button>`).join('')}</div>
    <div class="chips scroll">${Object.entries(SK).map(([k, v]) => `<button class="chip ${k === skill ? 'on' : ''}" data-act="skill" data-v="${k}">${v}</button>`).join('')}</div>
    <label class="opt"><input type="checkbox" id="mine" ${mine ? 'checked' : ''}> <span>Only what fits my level (${level})</span></label>
    ${list.map((r) => `<a class="card link" href="${esc(r.url)}" target="_blank" rel="noopener"><span><strong>${esc(r.name)}</strong> <span class="tag">${esc(r.levels)}</span> <span class="tag">${esc(r.format)}</span><br><span class="muted small">${esc(r.note)}</span><br><span class="muted small">${[...r.skills].map((s) => SK[s]).filter(Boolean).join(' · ')}</span></span><span class="chev">↗</span></a>`).join('') || '<p class="muted">Nothing matches. Untick the level filter.</p>'}
    <p class="muted small">The scheduled Claude task checks these links and adds new finds each week.</p>`;
  on(root, { lang: (el) => { lang = el.dataset.v; render(root); }, skill: (el) => { skill = el.dataset.v; render(root); } });
  root.onchange = (e) => { if (e.target.id === 'mine') { mine = e.target.checked; render(root); } };
}
