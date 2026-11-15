// Languages: status and levels, Rosetta Stone progress, custom items, grammar reference, corrections.
import { state, save } from '../store.js';
import { content, itemsFor, feedback } from '../content.js';
import { lessonId, unitProgress, isIntroduced } from '../srs.js';
import { nextDue } from '../assess.js';
import { LANGS, LANG_IDS, LEVELS, SKILLS, unitLevel, uid } from '../model.js';
import { esc, $, on, fmtDate, toast } from '../ui.js';

const sel = (name, value, options) => `<select data-field="${name}">${options.map((o) => `<option ${o === value ? 'selected' : ''}>${o}</option>`).join('')}</select>`;

export function render(root, [lang]) {
  if (lang === 'feedback') return corrections(root);
  if (lang && LANGS[lang]) return detail(root, lang);
  const p = state.profile;
  root.innerHTML = `<header class="top"><h1>Languages</h1></header>
    ${LANG_IDS.map((l) => { const c = p.langs[l]; return `<a class="card link" href="#/languages/${l}"><span>${LANGS[l].flag} <strong>${LANGS[l].name}</strong><br><span class="muted small">${c.status} · level ${c.level} → ${c.target}</span></span><span class="chev">›</span></a>`; }).join('')}
    <a class="card link" href="#/languages/feedback"><span><strong>Corrections</strong><br><span class="muted small">Your writing and speaking, corrected by Claude</span></span><span class="chev">›</span></a>`;
}

function detail(root, lang) {
  const p = state.profile; const c = p.langs[lang]; const ls = state.langs[lang];
  const rs = content.rosetta; const units = (rs.levels[lang] || 0) * 4;
  const items = itemsFor(lang);
  const due = nextDue(lang, state.assessments);
  const open = root.dataset.open ? +root.dataset.open : 0;

  root.innerHTML = `
    <header class="top"><div><a class="back" href="#/languages">‹ Languages</a><h1>${LANGS[lang].flag} ${LANGS[lang].name}</h1></div></header>
    <section class="card"><h2>Status and level</h2>
      <div class="form">
        <label>Status ${sel('status', c.status, ['active', 'maintain', 'paused'])}</label>
        <label>Current level ${sel('level', c.level, LEVELS)}</label>
        <label>Target level ${sel('target', c.target, LEVELS.slice(1))}</label>
        ${lang === 'es' ? `<label>Variant <select data-pref="esVariant"><option value="latam" ${p.esVariant === 'latam' ? 'selected' : ''}>Latin America</option><option value="es" ${p.esVariant === 'es' ? 'selected' : ''}>Spain</option></select></label>` : ''}
        ${lang === 'zh' ? `<label>Script <select data-pref="zhScript"><option value="simp" ${p.zhScript === 'simp' ? 'selected' : ''}>Simplified</option><option value="trad" ${p.zhScript === 'trad' ? 'selected' : ''}>Traditional</option></select></label>` : ''}
      </div>
      <p class="muted small">Active = learning new material. Maintain = keep what you know. Paused = hidden from sessions. ${lang === 'es' ? 'Both Spanish variants are shown on every card and both are accepted as answers; this sets which one comes first and the voice.' : ''}</p>
      <div class="kv small"><span class="muted">${due ? `Last level check ${fmtDate(due - 90 * 86400000)}, next ${fmtDate(due)}` : 'No level check yet'}</span><a class="btn sm" href="#/assess/${lang}">Take level check</a></div>
      <p class="muted small">Per skill: ${SKILLS.map((k) => `${k} ${c.skills?.[k] || c.level}`).join(' · ')}</p>
    </section>

    <section class="card"><h2>Rosetta Stone</h2>
      <p class="muted small">Tick lessons as you finish them. Their vocabulary and sentences then enter your reviews.</p>
      ${Array.from({ length: units }, (_, i) => i + 1).map((u) => {
    const prog = unitProgress(ls, u, rs.lessonsPerUnit);
    const n = items.filter((it) => it.unit === u).length;
    return `${(u - 1) % 4 === 0 ? `<h3>Level ${(u - 1) / 4 + 1}</h3>` : ''}
        <details class="unit" ${open === u ? 'open' : ''} data-u="${u}"><summary><span>${prog === 1 ? '✓' : prog > 0 ? '◐' : '○'} Unit ${u}: ${esc(rs.units[u - 1])}</span><span class="muted small">${unitLevel(u)} · ${n} items</span></summary>
          <div class="lessons">${Array.from({ length: rs.lessonsPerUnit }, (_, k) => k + 1).map((k) => `<label class="opt"><input type="checkbox" data-lesson="${lessonId(u, k)}" data-u="${u}" ${ls.rs[lessonId(u, k)]?.done ? 'checked' : ''}> <span>Lesson ${k}</span></label>`).join('')}
          <button class="btn ghost sm" data-act="unit" data-u="${u}">${prog === 1 ? 'Untick all' : 'Tick whole unit'}</button></div></details>`;
  }).join('')}
    </section>

    <section class="card"><h2>Add your own item</h2>
      <p class="muted small">A word or phrase from Rosetta Stone, a film, a conversation. It joins your reviews straight away.</p>
      <div class="form">
        <label>${LANGS[lang].name} <input id="ct" lang="${lang}" autocapitalize="off" autocomplete="off"></label>
        ${lang === 'zh' ? '<label>Pinyin <input id="cr" autocapitalize="off" autocomplete="off"></label>' : ''}
        <label>English <input id="ce" autocomplete="off"></label>
      </div>
      <button class="btn" data-act="add">Add</button>
      ${ls.custom.length ? `<p class="muted small">${ls.custom.length} custom item${ls.custom.length > 1 ? 's' : ''}: ${ls.custom.slice(-8).map((x) => esc(x.t)).join(', ')}</p>` : ''}
    </section>

    <section class="card"><h2>Grammar reference</h2>
      ${(content.grammar[lang] || []).map((g) => `<details class="unit"><summary><span>${isIntroduced(ls, { id: `${g.id}-0`, type: 'grammar' }) ? '✓ ' : ''}${esc(g.title)}</span><span class="muted small">Unit ${g.unit}</span></summary><p>${esc(g.explain)}</p>${g.ex.map(([s, en]) => `<p lang="${lang}"><strong>${esc(s.replace(/[{}]/g, ''))}</strong><br><span class="muted">${esc(en)}</span></p>`).join('')}</details>`).join('')}
    </section>`;

  const commit = async () => { await save(['profile', `lang:${lang}`]); };
  root.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.field) {
      c[t.dataset.field] = t.value;
      if (t.dataset.field === 'level') c.skills = Object.fromEntries(SKILLS.map((k) => [k, t.value]));
      await commit(); detail(root, lang);
    } else if (t.dataset.pref) { p[t.dataset.pref] = t.value; await commit(); }
    else if (t.dataset.lesson) {
      ls.rs[t.dataset.lesson] = { done: t.checked, t: Date.now() };
      root.dataset.open = t.dataset.u; await commit(); detail(root, lang);
    }
  };
  on(root, {
    unit: async (el) => {
      const u = +el.dataset.u; const all = unitProgress(ls, u, rs.lessonsPerUnit) === 1;
      for (let k = 1; k <= rs.lessonsPerUnit; k++) ls.rs[lessonId(u, k)] = { done: !all, t: Date.now() };
      root.dataset.open = u; await commit(); detail(root, lang);
    },
    add: async () => {
      const t = $('#ct', root).value.trim(); const en = $('#ce', root).value.trim();
      if (!t || !en) { toast('Fill in both fields.'); return; }
      const item = { id: `${lang}-x${uid()}`, type: /[.?!。？！]$/.test(t) || t.split(/\s+/).length > 4 ? 'sentence' : 'vocab', t, en, level: c.level === 'A0' ? 'A1' : c.level, u: Date.now() };
      const r = $('#cr', root)?.value.trim(); if (r) item.r = r;
      ls.custom.push(item); await commit(); toast('Added to your reviews.'); detail(root, lang);
    },
  });
}

function corrections(root) {
  const fb = new Map(feedback().map((f) => [f.submissionId, f]));
  const subs = [...state.submissions].sort((a, b) => b.t - a.t);
  root.innerHTML = `<header class="top"><div><a class="back" href="#/languages">‹ Languages</a><h1>Corrections</h1></div></header>
    ${subs.length ? subs.map((s) => { const f = fb.get(s.id); return `<section class="card">
      <div class="eyebrow">${LANGS[s.lang]?.flag || ''} ${esc(s.kind)} · ${fmtDate(s.t)} ${f ? (f.level ? `· assessed ${esc(f.level)}` : '') : '· waiting for the next Claude run'}</div>
      <p class="muted small">${esc(s.prompt)}</p><p lang="${s.lang}">${esc(s.text)}</p>
      ${f ? `${f.corrected ? `<h3>Corrected</h3><p lang="${s.lang}">${esc(f.corrected)}</p>` : ''}${(f.errors || []).length ? `<h3>What to fix</h3><ul>${f.errors.map((e) => `<li>${esc(typeof e === 'string' ? e : `${e.wrong} → ${e.right}${e.why ? `: ${e.why}` : ''}`)}</li>`).join('')}</ul>` : ''}${f.comments ? `<p>${esc(f.comments)}</p>` : ''}` : ''}
    </section>`; }).join('') : '<p class="muted">Nothing submitted yet. Writing and speaking tasks in your sessions appear here, with corrections after the next scheduled Claude run.</p>'}`;
  const unseen = subs.filter((s) => fb.has(s.id) && !s.seen);
  if (unseen.length) { unseen.forEach((s) => { s.seen = true; s.u = Date.now(); }); save('submissions'); }
}
