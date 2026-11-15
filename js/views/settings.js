import { state, save, exportAll, importAll } from '../store.js';
import { canSpeak, hasVoice, canRecognize, speak } from '../speech.js';
import { LANGS, LANG_IDS } from '../model.js';
import { esc, $, on, toast, fmtDate } from '../ui.js';

export function render(root) {
  const p = state.profile; const s = state.sync;
  root.innerHTML = `<header class="top"><h1>Settings</h1></header>
    <section class="card"><h2>Study time</h2><div class="form">
      <label>Minutes per day in this app <input type="number" min="5" max="240" step="5" data-num="dailyMinutes" value="${p.dailyMinutes}"></label>
      <label>Minutes per day of Rosetta Stone <input type="number" min="0" max="240" step="5" data-num="rosettaMinutes" value="${p.rosettaMinutes}"></label>
      <label class="opt"><input type="checkbox" data-bool="ahead" ${p.ahead ? 'checked' : ''}> <span>When I have reviewed everything from Rosetta Stone, introduce material from the next units</span></label>
    </div></section>

    <section class="card"><h2>Sync between devices</h2>
      <p class="muted small">Progress is stored in your private GitHub repository. Enter the same details on each device.</p>
      <div class="form">
        <label>GitHub user or organisation <input id="owner" value="${esc(s.owner)}" autocapitalize="off" autocomplete="off"></label>
        <label>Private data repository <input id="repo" value="${esc(s.repo)}" placeholder="leng-data" autocapitalize="off" autocomplete="off"></label>
        <label>Access token <input id="token" type="password" value="${esc(s.token)}" autocomplete="off"></label>
      </div>
      <div class="row"><button class="btn" data-act="savesync">Save and sync</button>${s.token ? '<button class="btn ghost" data-act="forget">Remove from this device</button>' : ''}</div>
      <p class="muted small">${s.error ? `Problem: ${esc(s.error)}` : s.lastSync ? `Last synced ${fmtDate(s.lastSync)} ${new Date(s.lastSync).toLocaleTimeString()}` : 'Not synced yet.'}</p>
      <details class="unit"><summary><span>How to set this up</span></summary>
        <ol><li>On GitHub, create a new <strong>private</strong> repository, for example <code>leng-data</code>.</li>
        <li>Go to Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li>
        <li>Repository access: only the data repository. Permissions: Contents, read and write.</li>
        <li>Paste the token here. It is stored only on this device and sent only to GitHub.</li></ol></details>
    </section>

    <section class="card"><h2>Voices on this device</h2>
      ${canSpeak() ? LANG_IDS.map((l) => `<div class="kv small"><span>${LANGS[l].flag} ${LANGS[l].name}</span><span>${hasVoice(l) ? '<button class="btn ghost sm" data-act="voice" data-l="' + l + '">Test</button>' : '<span class="tag warn">no voice installed</span>'}</span></div>`).join('') : '<p class="muted">This browser has no text-to-speech.</p>'}
      <p class="muted small">Missing a voice? On iPhone and iPad: Settings → Accessibility → Spoken Content → Voices. On Mac: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices. Speech recognition for speaking practice is ${canRecognize() ? 'available' : 'not available'} in this browser.</p>
    </section>

    <section class="card"><h2>Backup</h2>
      <div class="row"><button class="btn ghost" data-act="export">Export a backup file</button><label class="btn ghost">Import<input type="file" id="imp" accept="application/json" hidden></label></div>
    </section>
    <p class="muted small center">To install: in Safari use Share → Add to Home Screen (iPhone, iPad) or File → Add to Dock (Mac).</p>`;

  root.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.num) { p[t.dataset.num] = Math.max(+t.min, Math.min(+t.max, +t.value || 0)); await save('profile'); }
    else if (t.dataset.bool) { p[t.dataset.bool] = t.checked; await save('profile'); }
    else if (t.id === 'imp' && t.files[0]) {
      try { await importAll(await t.files[0].text()); toast('Backup imported.'); render(root); } catch (err) { toast(err.message, 4000); }
    }
  };
  on(root, {
    voice: (el) => speak({ ko: '안녕하세요', es: 'Hola, ¿qué tal?', pt: 'Olá, tudo bem?', zh: '你好', de: 'Guten Tag', it: 'Buongiorno' }[el.dataset.l], el.dataset.l),
    savesync: async () => {
      s.owner = $('#owner', root).value.trim(); s.repo = $('#repo', root).value.trim(); s.token = $('#token', root).value.trim();
      s.shas = {}; await save('sync', { local: true });
      window.dispatchEvent(new Event('leng:sync'));
      setTimeout(() => { if (root.isConnected) render(root); }, 4000);
    },
    forget: async () => { s.token = ''; s.shas = {}; await save('sync', { local: true }); render(root); },
    export: () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([exportAll()], { type: 'application/json' }));
      a.download = `leng-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    },
  });
}
