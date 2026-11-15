// The study session: review cards, new-item introductions, then one longer skill task.
import { state, save } from '../store.js';
import { getItem, textsFor, resourcesFor, resourceFits } from '../content.js';
import { grade, introduce, formsFor, logTask } from '../srs.js';
import { PROMPTS, shuffle } from '../assess.js';
import { LANGS, FORM_LABEL, display, accepted, checkAnswer, uid, lv, LEVELS } from '../model.js';
import { speak, canRecognize, listen, loadHanziWriter, ttsLang } from '../speech.js';
import { esc, $, $$, on, go } from '../ui.js';

let run = null;
export function setRun(s) { run = { ...s, queue: [...s.queue], i: 0, start: Date.now(), done: 0, ok: 0, requeued: new Set(), phase: 'cards' }; }

export function render(root) {
  if (!run) { go('#/today'); return; }
  next(root);
}

const head = (label) => `
  <div class="sess-head"><button class="icon-btn" data-act="quit" aria-label="End session">✕</button>
    <div class="progress"><i style="width:${run.queue.length ? Math.round((run.i / run.queue.length) * 100) : 100}%"></i></div>
    <span class="muted small">${Math.min(run.i + 1, run.queue.length)}/${run.queue.length}</span></div>
  <div class="sess-meta">${label}</div>`;

function next(root) {
  if (run.i >= run.queue.length) return run.task && run.phase === 'cards' ? task(root) : finish(root);
  const e = run.queue[run.i];
  return e.kind === 'new' ? intro(root, e) : card(root, e);
}

function details(item) {
  const p = state.profile;
  const T = display(item, p);
  const other = item.lang === 'es' && item.latam ? `<p class="muted small">Spain: ${esc(item.t)} · Latin America: ${esc(item.latam)}</p>`
    : item.lang === 'zh' && item.trad && item.trad !== item.t ? `<p class="muted small">Simplified ${esc(item.t)} · Traditional ${esc(item.trad)}</p>` : '';
  return `<div class="big" lang="${ttsLang(item.lang)}">${esc(T)}</div>
    ${item.r ? `<p class="reading">${esc(item.r)}</p>` : ''}
    <p class="meaning">${esc(item.en)}</p>${other}
    ${item.title ? `<div class="explain"><strong>${esc(item.title)}</strong><br>${esc(item.explain)}</div>` : ''}
    ${item.note ? `<p class="muted small">${esc(item.note)}</p>` : ''}
    <button class="btn ghost" data-act="play">🔊 Listen</button>`;
}

function intro(root, e) {
  const ls = state.langs[e.lang];
  const item = getItem(e.lang, e.itemId);
  if (!item) { run.i++; return next(root); }
  root.innerHTML = `${head(`${LANGS[e.lang].flag} ${LANGS[e.lang].name} · New ${item.type === 'grammar' ? 'grammar point' : item.type}`)}
    <div class="flash">${details(item)}</div>
    <div class="sess-foot"><button class="btn big" data-act="ok">Got it</button></div>`;
  const T = display(item, state.profile);
  speak(T, e.lang);
  on(root, {
    play: () => speak(T, e.lang),
    quit: () => finish(root),
    ok: () => {
      introduce(ls, item); save(`lang:${e.lang}`);
      const first = `${item.id}:${formsFor(item)[0]}`;
      run.queue.splice(Math.min(run.i + 4, run.queue.length), 0, { kind: 'review', lang: e.lang, cardId: first });
      run.i++; next(root);
    },
  });
}

function card(root, e) {
  const ls = state.langs[e.lang];
  const c = ls.cards[e.cardId];
  const item = c && getItem(e.lang, c.item);
  if (!item) { run.i++; return next(root); }
  const p = state.profile; const name = LANGS[e.lang].name;
  const T = display(item, p);
  const t0 = performance.now();
  let suggest = null; let verdict = ''; let rec = null;
  const input = `<input id="ans" type="text" lang="${ttsLang(e.lang)}" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Type your answer">`;
  const fronts = {
    recognize: `<div class="big" lang="${ttsLang(e.lang)}">${esc(T)}</div><p class="muted">What does it mean?</p><button class="btn ghost" data-act="play">🔊</button>`,
    listen: `<button class="play-big" data-act="play" aria-label="Play">🔊</button><p class="muted">Listen. What does it mean?</p>`,
    produce: `<p class="prompt">${esc(item.en)}</p><p class="muted">Write it in ${name}${item.lang === 'es' && item.latam ? ` (${p.esVariant === 'latam' ? 'Latin America' : 'Spain'})` : ''}</p>${input}`,
    cloze: `<div class="big sm" lang="${ttsLang(e.lang)}">${esc(item.q || '')}</div><p class="muted">${esc(item.en)}</p>${input}`,
    speak: `<p class="prompt">${esc(item.en)}</p><p class="muted">Say it aloud in ${name}</p>${canRecognize() ? '<button class="btn ghost" data-act="mic">🎙 Record</button><p id="heard" class="heard"></p>' : ''}`,
    hand: `<p class="prompt">${esc(item.en)}</p><p class="reading">${esc(item.r || '')}</p><div id="hz" class="hz"></div><p id="hzmsg" class="muted small">Draw each character stroke by stroke.</p>`,
  };
  root.innerHTML = `${head(`${LANGS[e.lang].flag} ${name} · ${FORM_LABEL[c.form]}`)}
    <div class="flash"><div id="front">${fronts[c.form]}</div><div id="back" hidden></div></div>
    <div class="sess-foot" id="foot"><button class="btn big" data-act="reveal">${c.form === 'produce' || c.form === 'cloze' ? 'Check' : 'Show answer'}</button></div>`;

  const reveal = () => {
    if (!$('#back', root).hidden) return;
    rec?.stop();
    const ans = $('#ans', root);
    if (ans) {
      const res = checkAnswer(ans.value, c.form === 'cloze' ? [item.cloze] : accepted(item));
      suggest = res === 'exact' ? 3 : res === 'close' ? 2 : 1;
      verdict = `<p class="verdict ${res}">${res === 'exact' ? 'Correct' : res === 'close' ? 'Almost: check the article or accents' : ans.value.trim() ? `Not quite. You wrote: ${esc(ans.value)}` : 'No answer given'}</p>`;
      ans.disabled = true;
    }
    if (c.form !== 'recognize' && c.form !== 'cloze') $('#front', root).classList.add('dim');
    const b = $('#back', root); b.hidden = false; b.innerHTML = verdict + details(item);
    $('#foot', root).innerHTML = `<div class="grades">${[['1', 'Again'], ['2', 'Hard'], ['3', 'Good'], ['4', 'Easy']].map(([g, l]) => `<button class="grade g${g} ${+g === suggest ? 'sug' : ''}" data-act="grade" data-g="${g}">${l}</button>`).join('')}</div>`;
    if (c.form !== 'listen') speak(T, e.lang);
  };

  if (c.form === 'listen') speak(T, e.lang);
  const ans = $('#ans', root);
  if (ans) { ans.focus({ preventScroll: true }); ans.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') reveal(); }); }
  if (c.form === 'hand') handwriting(root, T, (mistakes, chars) => { suggest = mistakes <= chars ? 3 : mistakes <= chars * 4 ? 2 : 1; verdict = `<p class="verdict ${suggest === 3 ? 'exact' : suggest === 2 ? 'close' : 'wrong'}">${mistakes} stroke mistake${mistakes === 1 ? '' : 's'}</p>`; reveal(); });

  on(root, {
    play: () => speak(T, e.lang),
    reveal,
    quit: () => { rec?.stop(); finish(root); },
    mic: async (el) => {
      if (rec) { rec.stop(); return; }
      el.textContent = '■ Stop';
      rec = listen(e.lang, { onPartial: (t) => { const h = $('#heard', root); if (h) h.textContent = t; } });
      const heard = await rec.result; rec = null;
      if (!root.isConnected || !$('#back', root).hidden) return;
      el.textContent = '🎙 Record';
      if (heard) {
        const res = checkAnswer(heard, accepted(item));
        suggest = res === 'wrong' ? 1 : 3;
        verdict = `<p class="verdict ${res === 'wrong' ? 'wrong' : 'exact'}">Heard: ${esc(heard)}</p>`;
        reveal();
      }
    },
    grade: (el) => {
      const g = +el.dataset.g;
      grade(ls, c.id, g, { ms: Math.round(performance.now() - t0) });
      save(`lang:${e.lang}`);
      run.done++; if (g > 1) run.ok++;
      if (g === 1 && !run.requeued.has(c.id)) { run.requeued.add(c.id); run.queue.push({ ...e }); }
      run.i++; next(root);
    },
  });
}

async function handwriting(root, text, done) {
  const chars = [...text].filter((ch) => /\p{Script=Han}/u.test(ch));
  const box = $('#hz', root);
  if (!chars.length) return;
  let HW;
  try { HW = await loadHanziWriter(); } catch {
    $('#hzmsg', root).textContent = 'Stroke practice needs a connection. Write it on paper, then check.'; return;
  }
  let mistakes = 0; let i = 0;
  const one = () => {
    if (!root.isConnected) return;
    box.innerHTML = '';
    const size = Math.min(260, box.clientWidth || 260);
    const w = HW.create(box, chars[i], { width: size, height: size, padding: 8, showCharacter: false, showOutline: false, showHintAfterMisses: 2, drawingWidth: 24 });
    $('#hzmsg', root).textContent = `Character ${i + 1} of ${chars.length}`;
    w.quiz({ onComplete: (s) => { mistakes += s.totalMistakes; i++; if (i < chars.length) setTimeout(one, 500); else setTimeout(() => done(mistakes, chars.length), 500); } });
  };
  one();
}

// ---------- the longer skill task ----------
function task(root) {
  run.phase = 'task';
  const { lang, skill, minutes } = run.task;
  const ls = state.langs[lang]; const name = LANGS[lang].name;
  const t0 = Date.now();
  const level = LEVELS[Math.min(5, Math.max(1, lv(state.profile.langs[lang].skills?.[skill] || state.profile.langs[lang].level)))];
  const title = `${LANGS[lang].flag} ${name} · ${skill[0].toUpperCase() + skill.slice(1)} task · about ${minutes} min`;
  const top = `<div class="sess-head"><button class="icon-btn" data-act="skip" aria-label="Skip">✕</button><div class="progress"><i style="width:100%"></i></div></div><div class="sess-meta">${title}</div>`;
  const complete = (what) => { logTask(ls, skill, Math.min(Date.now() - t0, minutes * 2 * 60000), what); save(`lang:${lang}`); finish(root); };

  if (skill === 'reading' || skill === 'listening') {
    const text = textsFor(lang).find((t) => !ls.rs[`t:${t.id}`]);
    if (text) {
      const qs = (text.q || []).map(([q, ok, ...wrong]) => ({ q, ok, options: shuffle([ok, ...wrong]) }));
      root.innerHTML = `${top}<div class="task">
        <h2>${esc(text.title || 'Text')}</h2>
        ${skill === 'listening' ? '<button class="btn" data-act="playtext">🔊 Play</button> <button class="btn ghost" data-act="showtext">Show text</button>' : '<button class="btn ghost" data-act="playtext">🔊 Listen</button>'}
        <p id="txt" class="passage" lang="${ttsLang(lang)}" ${skill === 'listening' ? 'hidden' : ''}>${esc(text.text)}</p>
        ${qs.map((x, i) => `<fieldset class="q" data-i="${i}"><legend>${esc(x.q)}</legend>${x.options.map((o) => `<label class="opt"><input type="radio" name="q${i}" value="${esc(o)}"> <span>${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}
        <button class="btn big" data-act="check">Check answers</button><p id="res"></p></div>`;
      on(root, {
        playtext: () => speak(text.text, lang, 0.85), showtext: () => { $('#txt', root).hidden = false; },
        skip: () => finish(root),
        check: (el) => {
          if (el.dataset.done) return complete(`text:${text.id}`);
          let score = 0;
          qs.forEach((x, i) => { const v = $(`input[name=q${i}]:checked`, root)?.value; const fs = $(`fieldset[data-i="${i}"]`, root); fs.classList.add(v === x.ok ? 'right' : 'wrong'); if (v === x.ok) score++; $$('input', fs).forEach((inp) => { inp.disabled = true; if (inp.value === x.ok) inp.parentElement.classList.add('ok'); }); });
          $('#txt', root).hidden = false;
          $('#res', root).textContent = `${score} of ${qs.length} correct`;
          ls.rs[`t:${text.id}`] = { done: true, t: Date.now(), score };
          el.textContent = 'Finish'; el.dataset.done = '1';
        },
      });
      return;
    }
    const letter = skill === 'reading' ? 'R' : 'L';
    const fits = resourcesFor(lang).filter((r) => resourceFits(r, level, letter));
    const r = fits.length ? fits[Math.floor(Date.now() / 86400000) % fits.length] : null;
    root.innerHTML = `${top}<div class="task"><h2>${skill === 'reading' ? 'Read' : 'Listen'} for ${minutes} minutes</h2>
      ${r ? `<p>Today's pick for your level (${level}):</p><a class="card link" href="${esc(r.url)}" target="_blank" rel="noopener"><span><strong>${esc(r.name)}</strong><br><span class="muted small">${esc(r.note)}</span></span><span class="chev">↗</span></a>` : '<p>Pick any material in the Library tab.</p>'}
      <p class="muted">Afterwards, note three new words or phrases under Languages so they enter your reviews.</p>
      <button class="btn big" data-act="done">I did it</button></div>`;
    on(root, { done: () => complete('resource'), skip: () => finish(root) });
    return;
  }

  const used = new Set(state.submissions.filter((s) => s.lang === lang).map((s) => s.prompt));
  const fromClaude = (state.inbox['inbox/prompts.json']?.[lang]?.[skill] || []).find((x) => !used.has(x));
  const prompt = fromClaude || PROMPTS[skill][level];
  root.innerHTML = `${top}<div class="task"><h2>${skill === 'writing' ? 'Write' : 'Speak'} in ${name}</h2>
    <p class="prompt">${esc(prompt)}</p>
    ${skill === 'speaking' ? `<p class="muted">Speak aloud. ${canRecognize() ? 'Record to capture a transcript, then correct it if the recognition misheard you.' : 'Then type the main sentences you said so they can be corrected.'}</p>${canRecognize() ? '<button class="btn" data-act="rec">🎙 Record</button>' : ''}` : ''}
    <textarea id="text" rows="8" lang="${ttsLang(lang)}" placeholder="${skill === 'writing' ? 'Write here' : 'Transcript'}"></textarea>
    <p class="muted small">Saved for correction by the next scheduled Claude run.</p>
    <button class="btn big" data-act="submit">Submit</button></div>`;
  let rec = null;
  on(root, {
    skip: () => { rec?.stop(); finish(root); },
    rec: async (el) => {
      if (rec) { rec.stop(); return; }
      el.textContent = '■ Stop';
      const area = $('#text', root); const before = area.value ? area.value + ' ' : '';
      rec = listen(lang, { continuous: true, onPartial: (t) => { area.value = before + t; } });
      await rec.result; rec = null; if (root.isConnected) el.textContent = '🎙 Record';
    },
    submit: () => {
      rec?.stop();
      const text = $('#text', root).value.trim();
      if (!text) { $('#text', root).focus(); return; }
      state.submissions.push({ id: uid(), lang, kind: skill, level, prompt, text, t: Date.now(), u: Date.now(), status: 'pending' });
      save('submissions');
      complete(skill);
    },
  });
}

function finish(root) {
  const mins = Math.max(1, Math.round((Date.now() - run.start) / 60000));
  const r = run; run = null;
  root.innerHTML = `<div class="done"><div class="done-mark">✓</div><h1>Session complete</h1>
    <div class="stats"><div><strong>${r.done}</strong><span>cards</span></div><div><strong>${r.done ? Math.round((r.ok / r.done) * 100) : 0}%</strong><span>recalled</span></div><div><strong>${mins}</strong><span>min</span></div></div>
    <a class="btn big" href="#/today">Back to today</a><a class="btn ghost" href="#/dashboard">See progress</a></div>`;
  root.onclick = null;
}
