// Shared constants and pure helpers (no DOM), usable in the browser and in node tests.
export const LANGS = {
  ko: { name: 'Korean', flag: '🇰🇷', tts: 'ko-KR', hours: 2.6 },
  es: { name: 'Spanish', flag: '🇪🇸', tts: 'es-ES', hours: 1 },
  pt: { name: 'Portuguese (Brazil)', flag: '🇧🇷', tts: 'pt-BR', hours: 1 },
  zh: { name: 'Mandarin', flag: '🇨🇳', tts: 'zh-CN', hours: 2.8 },
  de: { name: 'German', flag: '🇩🇪', tts: 'de-DE', hours: 1.3 },
  it: { name: 'Italian', flag: '🇮🇹', tts: 'it-IT', hours: 1 },
};
export const LANG_IDS = Object.keys(LANGS);
export const LEVELS = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const SKILLS = ['reading', 'writing', 'listening', 'speaking'];
export const FORM_SKILL = { recognize: 'reading', listen: 'listening', produce: 'writing', cloze: 'writing', hand: 'writing', speak: 'speaking' };
export const FORM_LABEL = { recognize: 'Reading recall', listen: 'Listening', produce: 'Written production', cloze: 'Grammar cloze', hand: 'Handwriting', speak: 'Speaking' };
// rough seconds per card, used to fit a session into the time available
export const FORM_SECS = { recognize: 8, listen: 12, produce: 18, cloze: 18, hand: 30, speak: 15 };
export const DAY = 86400000;

// Cumulative guided-study hours to reach each level for an English speaker
// learning a closely related language; multiplied by LANGS[x].hours.
export const LEVEL_HOURS = { A0: 0, A1: 90, A2: 200, B1: 380, B2: 600, C1: 850, C2: 1150 };
// Exam equivalents shown next to CEFR
export const EQUIV = {
  ko: { A1: 'TOPIK 1', A2: 'TOPIK 2', B1: 'TOPIK 3', B2: 'TOPIK 4', C1: 'TOPIK 5', C2: 'TOPIK 6' },
  zh: { A1: 'HSK 1-2', A2: 'HSK 3', B1: 'HSK 4', B2: 'HSK 5', C1: 'HSK 6', C2: 'HSK 7-9' },
};

export const lv = (l) => Math.max(0, LEVELS.indexOf(l));
export const unitLevel = (u) => (u <= 6 ? 'A1' : u <= 12 ? 'A2' : 'B1');
export const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function defaultProfile() {
  const mk = (status, level, target) => ({ status, level, target, skills: { reading: level, writing: level, listening: level, speaking: level } });
  return {
    dailyMinutes: 30, rosettaMinutes: 20, esVariant: 'latam', zhScript: 'simp', ahead: true, onboarded: false, u: 0,
    langs: {
      ko: mk('maintain', 'A2', 'B1'), es: mk('active', 'A1', 'B2'), pt: mk('active', 'A1', 'B2'),
      zh: mk('active', 'A1', 'B1'), de: mk('paused', 'A0', 'B1'), it: mk('paused', 'A0', 'B1'),
    },
  };
}
export const emptyLang = () => ({ cards: {}, log: [], rs: {}, custom: [] });

/** Parse the pipe-separated core file into per-language item lists. */
export function parseCore(tsv) {
  const out = Object.fromEntries(LANG_IDS.map((l) => [l, []]));
  for (const line of tsv.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [id, unit, type, en, ...cols] = line.split('|').map((x) => x.trim());
    LANG_IDS.forEach((lang, i) => {
      const raw = cols[i];
      if (!raw) return;
      const parts = raw.split('~');
      const item = { id: `${lang}-${id}`, lang, unit: +unit, level: unitLevel(+unit), type: type === 's' ? 'sentence' : 'vocab', en, t: parts[0] };
      if (lang === 'zh') { item.r = parts[1] || ''; item.trad = parts[2] || parts[0]; }
      else if (lang === 'es' && parts[1]) item.latam = parts[1];
      out[lang].push(item);
    });
  }
  return out;
}

/** Expand grammar points into cloze items. */
export function grammarItems(lang, points) {
  const out = [];
  for (const p of points || []) {
    p.ex.forEach(([s, en], i) => {
      const m = s.match(/\{(.+?)\}/);
      out.push({ id: `${p.id}-${i}`, lang, unit: p.unit, level: unitLevel(p.unit), type: 'grammar', en, t: s.replace(/[{}]/g, ''), cloze: m ? m[1] : '', q: s.replace(/\{.+?\}/, '_____'), title: p.title, explain: p.explain });
    });
  }
  return out;
}

/** The text to show for an item, honouring Spanish variant and Chinese script preferences. */
export function display(item, profile) {
  if (item.lang === 'zh' && profile?.zhScript === 'trad' && item.trad) return item.trad;
  if (item.lang === 'es' && profile?.esVariant === 'latam' && item.latam) return item.latam;
  return item.t;
}
export function accepted(item) {
  return [item.t, item.trad, item.latam, ...(item.alt || [])].filter(Boolean);
}

const ARTICLES = /^(el|la|los|las|un|una|o|a|os|as|um|uma|der|die|das|ein|eine|il|lo|i|gli|le|uno|l')\s+/i;
export function normalize(s) {
  return (s || '').toLowerCase().normalize('NFC').replace(/[.,!?¿¡。，？！、;:"“”'’()\s]+/g, ' ').trim();
}
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
/** Compare a typed answer: 'exact', 'close' (article or accent slip) or 'wrong'. */
export function checkAnswer(input, answers) {
  const a = normalize(input);
  if (!a) return 'wrong';
  const list = answers.map(normalize);
  if (list.includes(a)) return 'exact';
  const loose = (x) => stripAccents(x.replace(/'/g, "' ").replace(ARTICLES, '')).replace(/\s+/g, '');
  const raw = (input || '').toLowerCase().trim();
  if (answers.some((x) => loose(x.toLowerCase().trim()) === loose(raw))) return 'close';
  return 'wrong';
}
