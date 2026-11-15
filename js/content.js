// Loads the shipped content and combines it with custom items and material from the Claude inbox.
import { LANG_IDS, parseCore, grammarItems, lv } from './model.js';
import { state } from './store.js';

export const content = { core: {}, grammar: {}, rosetta: { units: [], levels: {}, lessonsPerUnit: 4 }, resources: {}, assess: {}, texts: {} };

export async function loadContent() {
  const j = (p) => fetch(p).then((r) => r.json());
  const [core, grammar, rosetta, resources, assess, texts] = await Promise.all([
    fetch('content/core.tsv').then((r) => r.text()), j('content/grammar.json'), j('content/rosetta.json'),
    j('content/resources.json'), j('content/assess.json'), j('content/texts.json'),
  ]);
  content.core = parseCore(core);
  content.grammar = grammar; content.rosetta = rosetta; content.resources = resources; content.assess = assess; content.texts = texts;
}

const inbox = (path) => state.inbox?.[path];
const norm = (lang, it) => ({ type: 'vocab', level: 'A1', ...it, lang, unit: it.unit || 0 });

export function itemsFor(lang) {
  const extra = [...(state.langs[lang].custom || []), ...(inbox(`inbox/items/${lang}.json`) || [])].filter((x) => x && x.id && x.t).map((x) => norm(lang, x));
  return [...(content.core[lang] || []), ...grammarItems(lang, content.grammar[lang]), ...extra];
}
export function allItems() { return Object.fromEntries(LANG_IDS.map((l) => [l, itemsFor(l)])); }
export function getItem(lang, id) { return itemsFor(lang).find((i) => i.id === id); }

export function textsFor(lang) { return [...(content.texts[lang] || []), ...(inbox(`inbox/texts/${lang}.json`) || [])]; }
export function resourcesFor(lang) {
  const rows = [...(content.resources[lang] || []), ...((inbox('inbox/resources.json') || {})[lang] || [])];
  return rows.map(([name, url, levels, skills, format, note]) => ({ name, url, levels, skills, format, note }));
}
export function resourceFits(r, level, skillLetter) {
  const [a, b] = (r.levels || 'A1-C2').split('-');
  const l = Math.max(1, lv(level));
  return lv(a) <= l + 1 && lv(b || a) >= l && (!skillLetter || r.skills.includes(skillLetter));
}
export function bankFor(lang, level) {
  return [...(content.assess[lang]?.[level] || []), ...((inbox(`inbox/assess/${lang}.json`) || {})[level] || [])];
}
export const feedback = () => inbox('inbox/feedback.json') || [];
export const claudeNote = () => inbox('inbox/note.json');
export const claudePlan = () => inbox('inbox/plan.json') || {};
