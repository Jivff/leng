// Text-to-speech for listening practice and speech recognition for speaking practice.
import { LANGS } from './model.js';
import { state } from './store.js';

const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
let voices = [];
if (synth) { const loadV = () => { voices = synth.getVoices(); }; loadV(); synth.addEventListener?.('voiceschanged', loadV); }

export function ttsLang(lang) {
  if (lang === 'es') return state.profile.esVariant === 'latam' ? 'es-MX' : 'es-ES';
  if (lang === 'zh') return state.profile.zhScript === 'trad' ? 'zh-TW' : 'zh-CN';
  return LANGS[lang].tts;
}
export const canSpeak = () => !!synth;
export function hasVoice(lang) { return voices.some((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang)); }

export function speak(text, lang, rate = 0.9) {
  if (!synth || !text) return Promise.resolve();
  return new Promise((res) => {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/_{2,}/g, ' '));
    const code = ttsLang(lang);
    u.lang = code; u.rate = rate;
    const lc = (v) => v.lang.replace('_', '-').toLowerCase();
    u.voice = voices.find((v) => lc(v) === code.toLowerCase()) || voices.find((v) => lc(v).startsWith(lang)) || null;
    u.onend = res; u.onerror = res;
    synth.speak(u);
    setTimeout(res, 20000);
  });
}

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canRecognize = () => !!SR;
/** Start listening. Returns { stop(), result: Promise<string> }. */
export function listen(lang, { continuous = false, onPartial } = {}) {
  const rec = new SR();
  rec.lang = ttsLang(lang); rec.continuous = continuous; rec.interimResults = true;
  let finalText = '';
  const result = new Promise((res) => {
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' '; else interim += e.results[i][0].transcript; }
      onPartial?.((finalText + interim).trim());
    };
    rec.onerror = () => res(finalText.trim());
    rec.onend = () => res(finalText.trim());
  });
  try { rec.start(); } catch { /* already started */ }
  return { stop: () => { try { rec.stop(); } catch { /* ignore */ } }, result };
}

let hanziLoading = null;
export function loadHanziWriter() {
  if (window.HanziWriter) return Promise.resolve(window.HanziWriter);
  if (!hanziLoading) hanziLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/hanzi-writer@3.7.2/dist/hanzi-writer.min.js';
    s.onload = () => res(window.HanziWriter); s.onerror = () => { hanziLoading = null; rej(new Error('offline')); };
    document.head.appendChild(s);
  });
  return hanziLoading;
}
