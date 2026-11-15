// Level check: adaptive question blocks, can-do self-rating, then writing and speaking samples for Claude to grade.
import { state, save } from '../store.js';
import { bankFor } from '../content.js';
import { step, toQuestion, result, shuffle, CAN_DO, PROMPTS, TEST_LEVELS } from '../assess.js';
import { logTask } from '../srs.js';
import { LANGS, EQUIV, SKILLS, uid, lv, LEVELS } from '../model.js';
import { speak, canRecognize, listen, ttsLang } from '../speech.js';
import { esc, $, on, go } from '../ui.js';

const KIND = { g: 'Grammar', v: 'Vocabulary', r: 'Reading', l: 'Listening' };

export function render(root, [lang]) {
  if (!LANGS[lang]) { go('#/languages'); return; }
  const cfg = state.profile.langs[lang];
  const t = { lang, history: [], t0: Date.now(), self: {}, samples: {} };
  const top = (label) => `<div class="sess-head"><button class="icon-btn" data-act="quit" aria-label="Close">✕</button><div class="sess-meta grow">${LANGS[lang].flag} ${LANGS[lang].name} level check · ${label}</div></div>`;
  const quit = () => go(`#/languages/${lang}`);

  const start = () => {
    root.innerHTML = `${top('Start')}<div class="task"><h2>Level check</h2>
      <p>About 10 to 15 minutes. You answer short blocks of grammar, vocabulary, reading and listening questions; the difficulty moves up or down until it finds your level. Then you rate your writing and speaking and leave a short sample of each, which Claude grades on its next scheduled run.</p>
      <p class="muted">Answer without a dictionary. If you do not know, pick "I don't know" rather than guessing: a lucky guess gives you a plan that is too hard.</p>
      <button class="btn big" data-act="go">Begin</button></div>`;
    on(root, { quit, go: () => block(step(t.history, cfg.level).next) });
  };

  const block = (level) => {
    const qs = shuffle(bankFor(lang, level)).slice(0, 5).map((r) => toQuestion(r));
    let i = 0; let score = 0; let listenOk = 0; let listenN = 0;
    const show = () => {
      const q = qs[i];
      root.innerHTML = `${top(`${KIND[q.kind]} · question ${i + 1} of ${qs.length}`)}<div class="task">
        ${q.kind === 'r' ? `<p class="passage" lang="${ttsLang(lang)}">${esc(q.extra)}</p>` : ''}
        ${q.kind === 'l' ? '<button class="play-big" data-act="play" aria-label="Play">🔊</button><p class="muted center">You can replay it twice.</p>' : ''}
        <p class="prompt" ${q.kind === 'g' ? `lang="${ttsLang(lang)}"` : ''}>${esc(q.q)}</p>
        <div class="opts">${[...q.options, "I don't know"].map((o, k) => `<button class="opt-btn" data-act="pick" data-k="${k}">${esc(o)}</button>`).join('')}</div></div>`;
      let plays = 0;
      const play = () => { if (plays++ < 3) speak(q.extra, lang, 0.9); };
      if (q.kind === 'l') play();
      on(root, {
        quit, play,
        pick: (el) => {
          const ok = q.options[+el.dataset.k] === q.correct;
          if (ok) score++;
          if (q.kind === 'l') { listenN++; if (ok) listenOk++; }
          i++;
          if (i < qs.length) return show();
          t.history.push({ level, score, n: qs.length, listenOk, listenN });
          const s = step(t.history);
          return s.done ? selfRate(s.level) : block(s.next);
        },
      });
    };
    if (!qs.length) { t.history.push({ level, score: 0, n: 1 }); const s = step(t.history); return s.done ? selfRate(s.level) : block(s.next); }
    show();
  };

  const selfRate = (level) => {
    t.level = level;
    const skills = ['writing', 'speaking']; let k = 0;
    const show = () => {
      const skill = skills[k];
      root.innerHTML = `${top(`Self-rating · ${skill}`)}<div class="task"><h2>${skill[0].toUpperCase() + skill.slice(1)}</h2>
        <p>Pick the highest statement that you can do comfortably today.</p>
        <div class="opts"><button class="opt-btn" data-act="pick" data-l="A0">None of these yet</button>${TEST_LEVELS.map((l) => `<button class="opt-btn" data-act="pick" data-l="${l}"><strong>${l}</strong> ${esc(CAN_DO[skill][l])}</button>`).join('')}</div></div>`;
      on(root, { quit, pick: (el) => { t.self[skill] = el.dataset.l; k++; if (k < skills.length) show(); else sample('writing'); } });
    };
    show();
  };

  const sample = (skill) => {
    const level = TEST_LEVELS[Math.max(0, Math.min(TEST_LEVELS.length - 1, TEST_LEVELS.indexOf(t.self[skill] === 'A0' ? 'A1' : t.self[skill])))];
    const prompt = PROMPTS[skill][level];
    const after = () => (skill === 'writing' ? sample('speaking') : finish());
    let rec = null;
    root.innerHTML = `${top(`${skill[0].toUpperCase() + skill.slice(1)} sample`)}<div class="task"><h2>${skill === 'writing' ? 'Writing' : 'Speaking'} sample</h2>
      <p class="prompt">${esc(prompt)}</p>
      ${skill === 'speaking' ? `<p class="muted">${canRecognize() ? 'Record yourself; the transcript appears below. Fix words the recognition misheard, but leave your own mistakes.' : 'Speak aloud, then type what you said as faithfully as you can.'}</p>${canRecognize() ? '<button class="btn" data-act="rec">🎙 Record</button>' : ''}` : '<p class="muted">No dictionary or translator.</p>'}
      <textarea id="text" rows="8" lang="${ttsLang(lang)}"></textarea>
      <div class="row"><button class="btn big" data-act="submit">Submit</button><button class="btn ghost" data-act="skip">Skip</button></div></div>`;
    on(root, {
      quit, skip: () => { rec?.stop(); after(); },
      rec: async (el) => {
        if (rec) { rec.stop(); return; }
        el.textContent = '■ Stop';
        const area = $('#text', root); const before = area.value ? `${area.value} ` : '';
        rec = listen(lang, { continuous: true, onPartial: (x) => { area.value = before + x; } });
        await rec.result; rec = null; if (el.isConnected) el.textContent = '🎙 Record';
      },
      submit: () => {
        rec?.stop();
        const text = $('#text', root).value.trim();
        if (!text) { $('#text', root).focus(); return; }
        t.samples[skill] = { prompt, text, level };
        after();
      },
    });
  };

  const finish = () => {
    const now = Date.now();
    const a = { id: uid(), ...result(lang, t.history, t.level, t.self, now) };
    state.assessments.push(a);
    for (const [skill, s] of Object.entries(t.samples)) state.submissions.push({ id: uid(), lang, kind: skill, assessment: a.id, level: s.level, prompt: s.prompt, text: s.text, t: now, u: now, status: 'pending' });
    const prev = cfg.level;
    cfg.level = a.level; cfg.skills = { ...a.skills };
    if (lv(cfg.target) < lv(cfg.level) && cfg.status === 'active') cfg.target = cfg.level;
    logTask(state.langs[lang], 'reading', Math.min(now - t.t0, 30 * 60000), 'assessment', now);
    save(['assessments', 'submissions', 'profile', `lang:${lang}`]);
    const eq = EQUIV[lang]?.[a.level];
    root.innerHTML = `<div class="done"><div class="done-mark">${a.level}</div><h1>${LANGS[lang].name}: ${a.level}${eq ? ` <span class="muted">(${eq})</span>` : ''}</h1>
      <p class="muted">${prev !== a.level ? `Previously set to ${prev}. ` : ''}Your plan and sessions now use this level.</p>
      <div class="card left">${SKILLS.map((k) => `<div class="kv"><span>${k[0].toUpperCase() + k.slice(1)}</span><strong>${a.skills[k]}${k === 'writing' || k === 'speaking' ? ' <span class="muted small">self-rated</span>' : ''}</strong></div>`).join('')}
        <p class="muted small">${Object.keys(t.samples).length ? 'Writing and speaking are self-rated for now and will be replaced by Claude\'s grade of your samples.' : 'Writing and speaking are self-rated because no samples were submitted.'} Next check in 3 months.</p></div>
      <a class="btn big" href="#/plan">See the plan</a><a class="btn ghost" href="#/dashboard/${lang}">Progress</a></div>`;
    root.onclick = null;
  };

  // LEVELS is referenced so a profile level outside the test range still starts sensibly
  if (!LEVELS.includes(cfg.level)) cfg.level = 'A1';
  start();
}
