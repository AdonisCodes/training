# Simon Ferns — Training

**Live site: https://adoniscodes.github.io/training/**

A static site for Simon Ferns's training plan on the road to **IRONMAN 70.3 Durban (Sun 6 Jun 2027)** and a **first marathon (Wed 22 Dec 2027)**. The plan runs from 5 Oct 2026 to 26 Dec 2027; all dates use Africa/Johannesburg time.

## What's on the site

- **Overview** — current phase, current week, today's and next sessions, and a weekly-hours chart across the whole plan.
- **Plan** — every planned session, browsable by week or by month (sport, duration, distance, interval structure).
- **Phases** — the eight training phases with date ranges and notes.
- **Races & tests** — goal races, training races and solo tests (A-races: Durban 70.3 and the December 2027 marathon).
- **Predictions** ([#predictions](https://adoniscodes.github.io/training/#predictions)) — the 60 kg weight plan and projected June race splits, including an honest look at the cutoffs. **Updated about once a week** by refreshing `data/predictions.json`.
- **Gym log** ([#gym](https://adoniscodes.github.io/training/#gym)) — structured by exercise / weight / reps / sets / RIR. Currently empty: gym numbers are only added from Simon's own logged sessions, never estimated.

## How it works

Plain HTML/CSS/JS (no build step). Chart.js is loaded from a CDN. All content is read at page load from the files in [`data/`](data/):

| File | Drives |
| --- | --- |
| `data/sessions.csv` | the full session plan (weeks, months, hours charts) |
| `data/phases.json` | the phase breakdown |
| `data/races.json` | races and tests |
| `data/predictions.json` | the whole Predictions tab (weekly refresh = replace this file) |
| `data/gym-log.json` | the gym log (`sessions` is empty until real entries are added) |
| `data/site.json` | title, plan dates, goal races |

To update the site, edit the data files and push to `main` — no HTML changes needed for weekly prediction refreshes.

## Local preview

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

(Serving over HTTP is needed because the page fetches the `data/` files.)

## Deployment

GitHub Pages deploys from `main` (site root) via [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which also enables Pages automatically on its first run after merge.
