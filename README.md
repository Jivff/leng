# Leng

A personal language-learning companion that runs as a web app on iPhone, iPad and Mac. It keeps what you learn (mainly in Rosetta Stone) alive with spaced repetition and active recall, checks your level every three months, plans the road to your target level, and fits each session to the time you have.

Languages: Korean, Spanish (Spain and Latin America), Brazilian Portuguese, Mandarin (Simplified, with a Traditional switch), German, Italian.

## What it does

- **Today**: say how many minutes you have (5, 15, 30, 60). The session takes the most-forgotten reviews first, then new material, then one longer task for your weakest skill.
- **Four skills**: reading recall, listening (device voices), typed production and grammar clozes, speaking (speech recognition where the browser has it), stroke-by-stroke Hanzi handwriting.
- **Rosetta Stone**: tick lessons as you finish them; their material joins your reviews. Add your own words too.
- **Level checks**: adaptive CEFR test per language (TOPIK and HSK equivalents shown), due every 90 days, with history.
- **Plan**: milestones and dates from your level to your target; switches to maintenance once the target is reached.
- **Progress**: level against target, learned and mastered, retention by skill, workload forecast, study habit, items that keep slipping.
- **Library**: curated free resources per language, filtered by level and skill.
- **Claude**: a scheduled task corrects your writing and speaking, writes new texts and practice items from your mistakes, reviews the plan weekly and scouts resources. See `automation/daily-task.md`.

## Setup

1. **Publish**: merge to `main`, then in the repository go to Settings → Pages → Source: **GitHub Actions**. The site appears at `https://<user>.github.io/leng/`. On a free GitHub plan the repository must be public; no personal data lives in it.
2. **Install**: open the site in Safari. iPhone and iPad: Share → Add to Home Screen. Mac: File → Add to Dock.
3. **Sync** (optional but needed for the Claude task): create a **private** repository such as `leng-data`; create a fine-grained personal access token limited to that repository with Contents read and write; enter owner, repository and token under Settings in the app on each device.
4. **Claude task**: give Claude access to both repositories and schedule a daily run with the contents of `automation/daily-task.md` as its instructions.
5. **Voices**: install voices for your languages (iOS: Settings → Accessibility → Spoken Content → Voices). The Settings screen shows which are missing.

## Development

No build step: plain ES modules.

```bash
python3 -m http.server 8000
```

```bash
node --test
```

- `js/fsrs.js`, `js/srs.js`: FSRS-5 scheduler and cards. `js/session.js`: session builder. `js/metrics.js`, `js/plan.js`, `js/assess.js`: KPIs, plan, level checks. `js/sync.js`: GitHub sync and merging.
- `content/`: shipped material. `core.tsv` holds vocabulary and sentences for all six languages, one concept per row.

## Data repository layout

Written by the app: `profile.json`, `state/<lang>.json`, `assessments.json`, `submissions.json`, `summary.json`.
Written by the Claude task: `inbox/feedback.json`, `inbox/items/<lang>.json`, `inbox/texts/<lang>.json`, `inbox/prompts.json`, `inbox/note.json`, `inbox/plan.json`, `inbox/resources.json`, `inbox/assess/<lang>.json`.
