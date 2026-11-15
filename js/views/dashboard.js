// Dashboard: KPIs across languages and a drill-down per language.
import { state } from '../store.js';
import { content, itemsFor, claudeNote, claudePlan } from '../content.js';
import { langMetrics, globalMetrics, skillBalance, MASTERED_DAYS } from '../metrics.js';
import { planFor } from '../plan.js';
import { nextDue } from '../assess.js';
import { LANGS, LANG_IDS, LEVELS, SKILLS, FORM_LABEL, EQUIV, lv, display } from '../model.js';
import { esc, pct, bars, meter, levelLine, fmtDate, fmtMonth } from '../ui.js';

const PACE = { ahead: 'good', 'on track': 'good', stable: 'good', behind: 'bad', slipping: 'bad', starting: 'muted' };
const rateColor = (r) => (r == null ? 'var(--muted)' : r >= 0.85 ? 'var(--good)' : r >= 0.7 ? 'var(--warn)' : 'var(--bad)');

function metricsFor(lang, now) {
  const m = langMetrics(lang, state.langs[lang], itemsFor(lang), { profile: state.profile, assessments: state.assessments, rosetta: content.rosetta, now });
  const plan = planFor(lang, state.profile, m, { now, rosetta: content.rosetta, inboxPlan: claudePlan() });
  return { m, plan };
}

export function render(root, [lang]) {
  if (lang && LANGS[lang]) return detail(root, lang);
  const now = Date.now(); const p = state.profile;
  const g = globalMetrics(state, now);
  const bal = skillBalance(state, now);
  const langs = LANG_IDS.filter((l) => p.langs[l].status !== 'paused');
  const note = claudeNote();
  const totalMin = SKILLS.reduce((s, k) => s + bal.skills[k].minutes, 0);
  const avg7 = g.last30.slice(-7).reduce((a, b) => a + b, 0) / 7;

  root.innerHTML = `
    <header class="top"><h1>Progress</h1></header>
    ${note?.weekly ? `<section class="card"><div class="eyebrow">Weekly review from Claude${note.date ? ` · ${esc(note.date)}` : ''}</div><p>${esc(note.weekly)}</p></section>` : ''}
    <section class="tiles">
      <div class="tile"><strong>${g.streak}</strong><span>day streak</span></div>
      <div class="tile"><strong>${g.days7}/7</strong><span>days this week</span></div>
      <div class="tile"><strong>${Math.round(avg7)}</strong><span>min/day (7d) of ${p.dailyMinutes}</span></div>
    </section>
    <section class="card"><h2>Minutes per day <span class="muted small">last 30 days, dashed line = ${p.dailyMinutes} min goal</span></h2>
      ${bars(g.last30, { line: p.dailyMinutes, title: (v) => `${Math.round(v)} min` })}</section>
    ${langs.map((l) => {
    const { m, plan } = metricsFor(l, now); const c = p.langs[l];
    return `<a class="card link block" href="#/dashboard/${l}">
        <div class="kv"><h2>${LANGS[l].flag} ${LANGS[l].name}</h2><span class="pill ${PACE[plan.pace] || 'muted'}">${plan.mode === 'maintain' ? 'Maintaining · ' : ''}${plan.pace || ''}</span></div>
        <div class="kv small"><span>Level <strong>${c.level}</strong> → target <strong>${c.target}</strong></span><span class="muted">${plan.mode === 'learn' && plan.targetDate ? `est. ${fmtMonth(plan.paceDate || plan.targetDate)}` : ''}</span></div>
        ${meter(lv(c.level) / 6, { target: lv(c.target) / 6 })}
        <div class="mini">
          <div><strong>${m.learnedTotal}</strong><span>learned</span></div>
          <div><strong>${m.masteredTotal}</strong><span>mastered</span></div>
          <div><strong style="color:${rateColor(m.retention.d30.rate)}">${pct(m.retention.d30.rate)}</strong><span>retained (30d)</span></div>
          <div><strong>${m.dueNow}</strong><span>due</span></div>
        </div></a>`;
  }).join('')}
    <section class="card"><h2>Skill balance <span class="muted small">last 14 days</span></h2>
      ${SKILLS.map((k) => { const s = bal.skills[k]; return `<div class="kv small"><span>${k[0].toUpperCase() + k.slice(1)}${bal.weakest === k && totalMin ? ' <span class="tag warn">needs work</span>' : ''}</span><span>${Math.round(s.minutes)} min · ${pct(s.acc)} recall</span></div>${meter(totalMin ? s.minutes / totalMin : 0)}`; }).join('')}
      <p class="muted small">Sessions steer the longer task towards the skill that needs work.</p></section>`;
}

function detail(root, lang) {
  const now = Date.now(); const c = state.profile.langs[lang];
  const { m, plan } = metricsFor(lang, now);
  const eq = EQUIV[lang];
  const hist = m.history.map((a) => ({ x: a.t, y: lv(a.level) }));
  const due = nextDue(lang, state.assessments);
  const kinds = [['vocab', 'Vocabulary'], ['sentence', 'Sentences'], ['grammar', 'Grammar']];
  const minutes30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(now - (29 - i) * 86400000); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return m.minutesByDay[k] || 0; });
  const totalSkillMin = SKILLS.reduce((s, k) => s + m.timeBySkill[k], 0);

  root.innerHTML = `
    <header class="top"><div><a class="back" href="#/dashboard">‹ Progress</a><h1>${LANGS[lang].flag} ${LANGS[lang].name}</h1></div>
      <span class="pill ${PACE[plan.pace] || 'muted'}">${plan.mode === 'maintain' ? 'Maintaining · ' : ''}${plan.pace || plan.mode}</span></header>

    <section class="card"><h2>Level vs target</h2>
      ${SKILLS.map((k) => `<div class="kv small"><span>${k[0].toUpperCase() + k.slice(1)}</span><strong>${c.skills?.[k] || c.level}${eq?.[c.skills?.[k]] ? ` <span class="muted">${eq[c.skills[k]]}</span>` : ''}</strong></div>${meter(lv(c.skills?.[k] || c.level) / 6, { target: lv(c.target) / 6 })}`).join('')}
      <p class="muted small">Marker = target ${c.target}${eq?.[c.target] ? ` (${eq[c.target]})` : ''}. ${plan.mode === 'learn' && plan.targetDate ? `Planned ${fmtMonth(plan.targetDate)}${plan.paceDate ? `, at your current pace ${fmtMonth(plan.paceDate)}` : ''}.` : plan.mode === 'maintain' ? 'Goal: hold this level.' : ''}</p>
      <h3>Assessment history</h3>
      ${levelLine(hist, LEVELS, lv(c.target))}
      <div class="kv small"><span class="muted">${due ? `Next level check ${due <= now ? 'is due now' : fmtDate(due)}` : 'No level check taken yet'}</span><a class="btn ghost sm" href="#/assess/${lang}">Take level check</a></div>
    </section>

    <section class="card"><h2>Learned</h2>
      <div class="mini"><div><strong>${m.learnedTotal}</strong><span>items learned</span></div><div><strong>${m.masteredTotal}</strong><span>mastered</span></div><div><strong>${m.cardsTotal}</strong><span>cards</span></div></div>
      ${kinds.map(([k, label]) => `<div class="kv small"><span>${label}</span><span>${m.mastered[k]} mastered / ${m.learned[k]} learned</span></div>${meter(m.learned[k] ? m.mastered[k] / m.learned[k] : 0, { color: 'var(--good)' })}`).join('')}
      <div class="kv small"><span>Rosetta Stone</span><span>${m.rs.unitsDone} of ${m.rs.unitsTotal} units (${m.rs.lessonsDone}/${m.rs.lessonsTotal} lessons)</span></div>${meter(m.rs.lessonsTotal ? m.rs.lessonsDone / m.rs.lessonsTotal : 0)}
      <div class="kv small"><span>Syllabus up to ${m.syllabus.level}</span><span>${m.syllabus.done} of ${m.syllabus.total} items</span></div>${meter(m.syllabus.total ? m.syllabus.done / m.syllabus.total : 0)}
      <p class="muted small">Mastered = every card form of the item has a memory stability of ${MASTERED_DAYS} days or more.</p>
    </section>

    <section class="card"><h2>Retained</h2>
      <div class="mini">${[['d7', '7 days'], ['d30', '30 days'], ['d90', '90 days']].map(([k, l]) => `<div><strong style="color:${rateColor(m.retention[k].rate)}">${pct(m.retention[k].rate)}</strong><span>${l} · ${m.retention[k].n} reviews</span></div>`).join('')}</div>
      <h3>By skill (30 days)</h3>
      ${SKILLS.map((k) => `<div class="kv small"><span>${k[0].toUpperCase() + k.slice(1)}</span><span>${pct(m.bySkill[k].rate)} <span class="muted">(${m.bySkill[k].n})</span></span></div>${meter(m.bySkill[k].rate || 0, { color: rateColor(m.bySkill[k].rate), target: 0.9 })}`).join('')}
      ${Object.keys(m.byForm).length ? `<h3>By exercise type (30 days)</h3>${Object.entries(m.byForm).map(([f, v]) => `<div class="kv small"><span>${FORM_LABEL[f] || f}</span><span>${pct(v.rate)} <span class="muted">(${v.n})</span></span></div>`).join('')}` : ''}
      <div class="kv small"><span>Long-term check <span class="muted">(established items, 90 days)</span></span><strong style="color:${rateColor(m.matureRate)}">${pct(m.matureRate)} <span class="muted">(${m.matureN})</span></strong></div>
      <p class="muted small">Retention = share of reviews you recalled. The scheduler aims for 90%.</p>
    </section>

    <section class="card"><h2>Workload</h2>
      <div class="mini"><div><strong>${m.dueNow}</strong><span>due now</span></div><div><strong>${m.overdue}</strong><span>overdue</span></div><div><strong>${Math.round(m.avgMinutes)}</strong><span>min/day · plan ${Math.round(plan.appMin)}</span></div></div>
      <h3>Reviews due, next 30 days</h3>${bars(m.forecast, { title: (v, i) => `${v} cards in ${i} day${i === 1 ? '' : 's'}` })}
      <h3>Minutes per day, last 30 days</h3>${bars(minutes30, { line: plan.appMin, title: (v) => `${Math.round(v)} min` })}
      <h3>Time by skill (30 days)</h3>
      ${SKILLS.map((k) => `<div class="kv small"><span>${k[0].toUpperCase() + k.slice(1)}</span><span>${Math.round(m.timeBySkill[k])} min</span></div>${meter(totalSkillMin ? m.timeBySkill[k] / totalSkillMin : 0)}`).join('')}
    </section>

    <section class="card"><h2>Items that keep slipping</h2>
      ${m.leeches.length ? m.leeches.map((x) => `<div class="kv small"><span><strong lang="${lang}">${esc(display(x.item, state.profile))}</strong> <span class="muted">${esc(x.item.en)} · ${FORM_LABEL[x.card.form]}</span></span><span class="tag warn">${x.card.lapses} lapses</span></div>`).join('') : '<p class="muted">None. Items forgotten three times or more appear here.</p>'}
    </section>`;
}
