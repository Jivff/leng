// Sync with a private GitHub repository through the Contents API.
// Local-first: every record carries a timestamp and merges are newest-record-wins,
// with the review log merged as a union so no device ever loses reviews.
import { LANG_IDS } from './model.js';

const newer = (a, b) => ((b?.u || b?.t || 0) > (a?.u || a?.t || 0) ? b : a);
function unionById(a = [], b = [], sortKey = 't') {
  const m = new Map();
  for (const x of [...a, ...b]) m.set(x.id, m.has(x.id) ? newer(m.get(x.id), x) : x);
  return [...m.values()].sort((x, y) => (x[sortKey] || 0) - (y[sortKey] || 0));
}
function mergeMap(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in out ? newer(out[k], v) : v;
  return out;
}
export function mergeLang(a, b) {
  if (!b) return a; if (!a) return b;
  return { cards: mergeMap(a.cards, b.cards), log: unionById(a.log, b.log), rs: mergeMap(a.rs, b.rs), custom: unionById(a.custom, b.custom, 'u') };
}
export const mergeProfile = (a, b) => (!b ? a : !a ? b : newer(a, b));
export const mergeList = (a, b) => unionById(a || [], b || []);

const b64 = (s) => { const bytes = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };

export class GitHub {
  constructor({ owner, repo, token }, fetchImpl) {
    this.base = `https://api.github.com/repos/${owner}/${repo}`;
    this.token = token; this.fetch = fetchImpl || ((...a) => fetch(...a));
  }
  async req(path, opt = {}) {
    // no-store: GitHub's API responses are cacheable for 60 s, and a stale file list makes the app
    // try to create files that already exist (GitHub then answers 422)
    const res = await this.fetch(this.base + path, { cache: 'no-store', ...opt, headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.headers || {}) } });
    return res;
  }
  /** Map of path -> blob sha for the whole repository ({} when the repository is empty). */
  async tree() {
    const r = await this.req('');
    if (r.status === 401 || r.status === 403) throw new Error('GitHub rejected the token. Check that it has Contents read and write access to the data repository.');
    if (r.status === 404) throw new Error('Data repository not found. Check the owner and name, and that the token can access it.');
    if (!r.ok) throw new Error(`GitHub error ${r.status}`);
    const { default_branch: branch } = await r.json();
    const t = await this.req(`/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    if (t.status === 409 || t.status === 404) return {};
    if (!t.ok) throw new Error(`GitHub error ${t.status}`);
    const out = {};
    for (const e of (await t.json()).tree || []) if (e.type === 'blob') out[e.path] = e.sha;
    return out;
  }
  async get(path) {
    const r = await this.req(`/contents/${path}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub error ${r.status} reading ${path}`);
    try { return JSON.parse(await r.text()); } catch { return null; }
  }
  /** Current blob sha of a file, or null when it does not exist. */
  async sha(path) {
    const r = await this.req(`/contents/${path}`, { headers: { Accept: 'application/vnd.github.object+json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub error ${r.status} reading ${path}`);
    return (await r.json()).sha || null;
  }
  async put(path, obj, sha) {
    const body = { message: `sync ${path}`, content: b64(JSON.stringify(obj)) };
    if (sha) body.sha = sha;
    const r = await this.req(`/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
    if (!r.ok) { const e = new Error(`GitHub error ${r.status} writing ${path}`); e.conflict = r.status === 409 || r.status === 422; throw e; }
    return (await r.json()).content.sha;
  }
}

/** The files this app owns in the data repository. */
export function dataFiles(state) {
  const files = [
    { path: 'profile.json', get: () => state.profile, set: (v) => { state.profile = v; }, merge: mergeProfile, key: 'profile' },
    { path: 'assessments.json', get: () => state.assessments, set: (v) => { state.assessments = v; }, merge: mergeList, key: 'assessments' },
    { path: 'submissions.json', get: () => state.submissions, set: (v) => { state.submissions = v; }, merge: mergeList, key: 'submissions' },
  ];
  for (const l of LANG_IDS) files.push({ path: `state/${l}.json`, get: () => state.langs[l], set: (v) => { state.langs[l] = v; }, merge: mergeLang, key: `lang:${l}` });
  return files;
}

/**
 * Pull, merge and push. Returns { pulled, pushed, inbox, changedKeys }.
 * `known` maps path -> sha of the version this device last saw, to skip unchanged downloads.
 */
export async function syncAll(state, cfg, { fetchImpl, summary } = {}) {
  const gh = new GitHub(cfg, fetchImpl);
  const known = cfg.shas || (cfg.shas = {});
  const dirty = cfg.dirty || (cfg.dirty = {});
  const tree = await gh.tree();
  const res = { pulled: [], pushed: [], inbox: [], changedKeys: [] };
  for (const f of dataFiles(state)) {
    const remoteSha = tree[f.path];
    let local = f.get();
    const remoteChanged = remoteSha && remoteSha !== known[f.path];
    let needPush = !remoteSha || dirty[f.key];
    if (remoteChanged) {
      const remote = await gh.get(f.path);
      const before = JSON.stringify(local);
      const merged = f.merge(local, remote);
      const after = JSON.stringify(merged);
      if (after !== before) { f.set(merged); local = merged; res.pulled.push(f.path); res.changedKeys.push(f.key); }
      needPush = after !== JSON.stringify(remote);
      known[f.path] = remoteSha;
    }
    if (needPush) {
      try {
        known[f.path] = await gh.put(f.path, local, remoteSha);
      } catch (e) {
        if (!e.conflict) throw e;
        // the file list was out of date: fetch the file as it is now, merge, and write once more
        const sha = await gh.sha(f.path);
        const remote = sha ? await gh.get(f.path) : null;
        const merged = remote ? f.merge(local, remote) : local;
        if (JSON.stringify(merged) !== JSON.stringify(local)) { f.set(merged); local = merged; res.pulled.push(f.path); res.changedKeys.push(f.key); }
        known[f.path] = await gh.put(f.path, local, sha);
      }
      res.pushed.push(f.path);
    }
    delete dirty[f.key];
  }
  if (summary && res.pushed.length) {
    const sum = summary();
    try { known['summary.json'] = await gh.put('summary.json', sum, tree['summary.json']); } catch (e) {
      if (!e.conflict) throw e;
      known['summary.json'] = await gh.put('summary.json', sum, await gh.sha('summary.json'));
    }
  }
  // read-only inbox written by the scheduled Claude task
  state.inbox = state.inbox || {};
  for (const [path, sha] of Object.entries(tree)) {
    if (!path.startsWith('inbox/') || !path.endsWith('.json') || known[path] === sha) continue;
    const v = await gh.get(path);
    if (v != null) { state.inbox[path] = v; res.inbox.push(path); }
    known[path] = sha;
  }
  for (const path of Object.keys(state.inbox)) if (!tree[path]) delete state.inbox[path];
  cfg.lastSync = Date.now();
  return res;
}
