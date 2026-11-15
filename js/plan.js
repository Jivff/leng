// Long-term plan: milestones from the current level to the target, pacing and learn/maintain mode.
import { LANGS, LANG_IDS, LEVELS, LEVEL_HOURS, DAY, lv } from './model.js';

const WEIGHT = { active: 1, maintain: 0.4, paused: 0 };
export function shares(profile) {
  const total = LANG_IDS.reduce((s, l) => s + WEIGHT[profile.langs[l].status], 0) || 1;
  return Object.fromEntries(LANG_IDS.map((l) => [l, WEIGHT[profile.langs[l].status] / total]));
}

export function planFor(lang, profile, m, { now = Date.now(), rosetta, inboxPlan } = {}) {
  const cfg = profile.langs[lang];
  const share = shares(profile)[lang];
  const appMin = profile.dailyMinutes * share;
  const rsMin = cfg.status === 'active' ? profile.rosettaMinutes * (share / (LANG_IDS.filter((l) => profile.langs[l].status === 'active').reduce((s, l) => s + shares(profile)[l], 0) || 1)) : 0;
  const plannedMin = appMin + rsMin;
  const reached = lv(cfg.level) >= lv(cfg.target);
  const mode = cfg.status === 'paused' ? 'paused' : (cfg.status === 'maintain' || reached) ? 'maintain' : 'learn';
  const out = { lang, mode, level: cfg.level, target: cfg.target, plannedMin, appMin, rsMin, milestones: [], focus: [], reached };

  // hours already banked since the last assessment
  const since = m?.lastAssessment?.t || 0;
  let banked = 0;
  if (m) for (const [k, v] of Object.entries(m.minutesByDay)) if (new Date(k).getTime() >= since) banked += v;
  banked = banked / 60;

  if (mode === 'learn') {
    const mult = LANGS[lang].hours;
    const base = LEVEL_HOURS[cfg.level] * mult;
    const actualMin = m && m.daysOfData >= 7 ? m.avgMinutes + rsMin : null;
    for (let i = lv(cfg.level) + 1; i <= lv(cfg.target); i++) {
      const L = LEVELS[i];
      const hours = Math.max(0, LEVEL_HOURS[L] * mult - base - banked);
      const days = plannedMin > 0 ? (hours * 60) / plannedMin : Infinity;
      const paceDays = actualMin ? (hours * 60) / Math.max(1, actualMin) : null;
      out.milestones.push({ level: L, hours: Math.round(hours), date: now + days * DAY, paceDate: paceDays != null ? now + paceDays * DAY : null });
    }
    const last = out.milestones[out.milestones.length - 1];
    out.targetDate = last?.date; out.paceDate = last?.paceDate;
    if (!actualMin) out.pace = 'starting';
    else { const ratio = m.avgMinutes / Math.max(1, appMin); out.pace = ratio >= 1.1 ? 'ahead' : ratio >= 0.8 ? 'on track' : 'behind'; out.paceRatio = ratio; }
  } else if (mode === 'maintain') {
    const r = m?.retention?.d30?.rate;
    out.pace = r == null ? 'starting' : r >= 0.85 ? 'stable' : 'slipping';
  }

  // focus for the coming week
  if (mode !== 'paused' && m) {
    if (m.overdue > 20) out.focus.push(`Clear the review backlog first (${m.overdue} overdue cards).`);
    if (mode === 'learn' && rosetta) {
      const total = (rosetta.levels[lang] || 0) * 4;
      let next = 0;
      for (let u = 1; u <= total; u++) if (!(m.rsUnits?.[u] === 1)) { next = u; break; }
      if (next) out.focus.push(`Rosetta Stone: Unit ${next}, ${rosetta.units[next - 1]}. Tick lessons as you finish them so they enter your reviews.`);
    }
    const weak = Object.entries(m.bySkill).filter(([, v]) => v.n >= 5).sort((a, b) => a[1].rate - b[1].rate)[0];
    if (weak && weak[1].rate < 0.85) out.focus.push(`Weakest skill: ${weak[0]} (${Math.round(weak[1].rate * 100)}% recall). Sessions will add extra ${weak[0]} practice.`);
    if (m.leeches.length) out.focus.push(`${m.leeches.length} items keep slipping. Review them on the dashboard and add a mnemonic or example.`);
    if (mode === 'maintain') out.focus.push('Maintenance: keep reviews current and do one longer reading, listening or speaking task every other day.');
    for (const f of inboxPlan?.[lang]?.focus || []) out.focus.push(f);
  }
  return out;
}
