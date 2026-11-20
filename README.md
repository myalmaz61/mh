# MyHub — Personal Tools v0.3.0

A mobile-first **Bulgarian / English**, local-first PWA for Android Chrome, with no accounts, no advertising, no paid dependencies and no build tools required for deployment.

## Included tools

- **Calculator**: basic maths, contextual percentages, calculation history, copy results.
- **World Clock**: selected time zones and daylight-saving transitions.
- **Notes**: text notes, checklists, favourites, pinned notes and local autosave.
- **Weather**: Open-Meteo (network required for refreshing; last forecast is cached for offline use).
- **Timer & Stopwatch** (new in 0.3.0): countdown, pause/resume, 12 saved durations maximum, stopwatch with up to 80 laps, persistent timestamps for correct elapsed time after reopening.

The Timer is **not a reliable Android background alarm**. Sound/vibration may occur only while the timer screen is visible and the browser allows it. Chrome may throttle or stop execution in the background. On reopening, remaining time is recalculated from the saved deadline. For critical reminders use the Android Clock app.

## Technology and privacy

- HTML/CSS/native JavaScript modules; no framework, npm dependency or server.
- IndexedDB `myhub-local` **version 1**, stores: `notes` and `meta`. Retained unchanged from v0.1/v0.2.
- The new timer/stopwatch data lives in the `meta` store as `timerData`. No database migration or clearing.
- PWA assets cached by `sw.js` under `myhub-shell-v0.3.0`. Open-Meteo requests are **not** stored by the Service Worker; weather snapshots use IndexedDB instead.
- JSON Backup format remains `format: 1` and backwards compatible with v0.1/v0.2 backups. New backups include timer data and presets. When exported, running sessions are frozen into a **paused** state in the backup, so restoring an old archive cannot trigger an unexpected delayed timer. The actual active timer is not modified during export.
- Restoring performs strict validation, then replaces notes/settings/history/weather cache/timers in one IndexedDB transaction. Make a backup before restoring.
- Works on a free public GitHub Pages repository. Pages publishes the code publicly, so never commit personal notes or backup files to GitHub.

## Publishing

Create or open an existing **public** repository, e.g. `myhub`. Copy all files from the extracted ZIP into the repository with the same folder structure. Set GitHub **Settings → Pages → Deploy from a branch → main / (root)**. The site will be `https://YOUR-USERNAME.github.io/myhub/`.

For upgrading from v0.2.0, use `MyHub-v0.3.0-UPDATE-ONLY.zip`. Replace only its files in the existing repository; do **not** delete the old files or browser data. See `START-HERE-BG.md` for complete Android instructions.

## Tests

`node --test tests/*.test.mjs` (or `npm test`, if Node is available) runs pure-module tests with Node, with **no installation** required. Interactive component tests were also conducted in Chromium with mocked storage. A full GitHub Pages / Android Chrome integration test must be conducted after deployment on your phone.

## Project structure

```text
index.html                    index + module entry
styles.css                    shared interface styles
weather.css                   isolated Weather styles
timer.css                     isolated Timer styles
manifest.webmanifest          PWA metadata
sw.js                         versioned offline app-shell
js/app.js                     navigation, Settings, backup UI
js/config.js                  version + tool metadata
js/db.js                      IndexedDB + JSON backups
js/i18n.js                    BG/EN translations
js/utils.js                   shared helpers
js/calculator.js              Calculator module
js/world-clock.js             World Clock module
js/notes.js                   Notes module
js/weather.js                 Open-Meteo Weather module
js/timer-core.js              pure timer arithmetic + validation
js/timer.js                   Timer / Stopwatch interface
tests/*.test.mjs              local checks
icons/                        app icons
START-HERE-BG.md              beginner-friendly setup guide
```
