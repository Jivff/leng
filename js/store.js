// Local-first state kept in memory and persisted to IndexedDB.
import { LANG_IDS, defaultProfile, emptyLang } from './model.js';

export const state = { profile: defaultProfile(), langs: {}, assessments: [], submissions: [], inbox: {}, sync: { owner: '', repo: '', token: '', shas: {}, dirty: {} } };
for (const l of LANG_IDS) state.langs[l] = emptyLang();

let db = null;
const listeners = new Set();
export const onSave = (fn) => listeners.add(fn);

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('leng', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const tx = (mode) => db.transaction('kv', mode).objectStore('kv');
const idbGet = (k) => new Promise((res) => { const r = tx('readonly').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });
const idbPut = (k, v) => new Promise((res) => { const r = tx('readwrite').put(v, k); r.onsuccess = () => res(); r.onerror = () => res(); });

function read(key) {
  if (key === 'profile') return state.profile;
  if (key.startsWith('lang:')) return state.langs[key.slice(5)];
  return state[key];
}
function write(key, v) {
  if (v === undefined) return;
  if (key === 'profile') state.profile = { ...defaultProfile(), ...v, langs: { ...defaultProfile().langs, ...v.langs } };
  else if (key.startsWith('lang:')) state.langs[key.slice(5)] = { ...emptyLang(), ...v };
  else if (key === 'sync') state.sync = { ...state.sync, ...v };
  else state[key] = v;
}
export const KEYS = ['profile', 'assessments', 'submissions', 'inbox', 'sync', ...LANG_IDS.map((l) => `lang:${l}`)];

export async function load() {
  try { db = await open(); } catch { db = null; return; }
  for (const k of KEYS) write(k, await idbGet(k));
}

/** Persist keys. `local: true` skips marking them for upload (used after a pull). */
export async function save(keys, { local = false } = {}) {
  for (const k of [].concat(keys)) {
    if (k === 'profile' && !local) state.profile.u = Date.now();
    if (!local && k !== 'sync' && k !== 'inbox') state.sync.dirty[k] = true;
    if (db) await idbPut(k, JSON.parse(JSON.stringify(read(k))));
  }
  if (db) await idbPut('sync', JSON.parse(JSON.stringify(state.sync)));
  if (!local) listeners.forEach((fn) => fn());
}

export function exportAll() {
  const { sync, ...rest } = state;
  return JSON.stringify({ exported: Date.now(), ...rest });
}
export async function importAll(json) {
  const d = JSON.parse(json);
  if (!d.profile || !d.langs) throw new Error('Not a Leng backup file.');
  state.profile = d.profile; state.assessments = d.assessments || []; state.submissions = d.submissions || [];
  for (const l of LANG_IDS) state.langs[l] = { ...emptyLang(), ...(d.langs[l] || {}) };
  await save(KEYS.filter((k) => k !== 'sync' && k !== 'inbox'));
}
