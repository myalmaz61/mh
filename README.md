# MyHub — Personal Tools v0.4.0

A **Bulgarian / English**, mobile-first, offline-friendly PWA for personal Android use. No advertising, accounts, paid APIs or build dependencies. The app can be deployed unchanged to free GitHub Pages and may later be packaged with Capacitor.

## Available tools

- **Calculator** — expressions, percentages, copy and local calculation history.
- **World Clock** — multiple time zones, accurate summer/winter DST changes.
- **Notes** — text, checklists, pinned/favourite notes and autosave.
- **Weather** — Open-Meteo, multiple cities, cached last forecast; internet for refreshing.
- **Timer & Stopwatch** — countdown, saved durations and laps. **Not a reliable background alarm on Android**.
- **Calendar (new v0.4.0)** — monthly calendar, daily agenda, create/edit/delete events, all-day or timed events, repeat daily/weekly/monthly/yearly, optional final repeat date. Local-only; **no notification or alarm**.

**Repeat policy:** Monthly repetitions are tied to their original day of month. For example, a monthly event starting on the 31st does *not* appear in a month without 31 days. A yearly 29 February event appears only in leap years. Event time is stored as local wall time; unlike external calendar services, MyHub does not synchronise, translate time zones or schedule reminders. Editing/deleting a recurring event affects **the whole series**, not individual occurrences. Each event has one date (multi-day events not yet supported).

## Technical and data safety

- Native HTML, CSS, and JavaScript ES modules, no framework or npm dependency for deployment.
- IndexedDB **`myhub-local` version 1**, unchanged since v0.1; `notes` and `meta` object stores. Calendar data resides at `meta.calendarData` with `{schema:1,events:[...]}`. 1000 events maximum. No migration or deletion of existing records on upgrade.
- Local-first; Calendar and other offline tools function without internet once the PWA assets have been cached.
- Settings > JSON Backup exports notes, favourites, settings, calculation history, weather snapshots, timer presets/state (running sessions frozen paused in backup), **and calendar events**. Backups use the existing `app:'MyHub', format:1` structure.
- Backups from v0.1–v0.3 **remain importable**. Since those backups do not contain a Calendar, restoring an older backup *replaces* current Calendar events with an empty Calendar. Export the current backup first; restore asks for confirmation and writes all data in one IndexedDB transaction.
- Invalid calendar backup data is rejected before import. Damaged calendar data in the live database is not silently overwritten; opening Calendar shows a warning, and export stops with a warning rather than discarding events.
- Never add personal JSON backup files or private event contents to the **public GitHub repository**. GitHub Pages hosts app code, not the private data.
- Service Worker cache: `myhub-shell-v0.4.0`. Both `js/calendar.js`, `js/calendar-core.js` and `calendar.css` must exist for the update to install correctly. No automatic network dependency for Calendar.

## Publishing with Android + GitHub

- Updating v0.3.0: use `MyHub-v0.4.0-UPDATE-ONLY.zip`; overwrite **only its listed files**, preserving the other working files and existing PWA storage.
- New installation: `MyHub-v0.4.0.zip` has the whole project.
- In GitHub Pages, use `Settings → Pages → Deploy from a branch → main / (root)` and keep the **same repository URL** when upgrading.
- Full phone instructions are in `START-HERE-BG.md`.

## Tests

From the extracted project, Node 22+ can run `node --test tests/*.test.mjs` without additional packages. The 36 automated tests cover existing modules, recurrence on month-end and DST dates, backup format compatibility, corrupt input, translations, and offline asset references. A separate mobile-emulated Chromium component test was run against Calendar using mocked local storage, covering create, weekly recurrence, edit, reload, delete and horizontal layout.

Full on-device verification on Android Chrome after GitHub Pages deployment is still required. There are no guaranteed background notifications.

## File layout

```text
.nojekyll
index.html
styles.css
weather.css
timer.css
calendar.css                 NEW — module-only stylesheet
manifest.webmanifest
sw.js                        UPDATED offline assets / version
package.json                UPDATED version
js/
  app.js                    UPDATED navigation
  config.js                 UPDATED version + tool registry
  db.js                     UPDATED backup / restore for calendar
  i18n.js                   UPDATED Bulgarian / English UI
  calendar.js               NEW calendar interface
  calendar-core.js          NEW independent recurrence / validation
  calculator.js             UNCHANGED
  world-clock.js            UNCHANGED
  notes.js                  UNCHANGED
  weather.js                UNCHANGED
  timer.js                  UNCHANGED
  timer-core.js             UNCHANGED
  utils.js                  UNCHANGED
tests/
  calendar.test.mjs         NEW calendar / backup / integrity tests
  timer.test.mjs            UPDATED expected version
  weather.test.mjs          UPDATED expected cache version
  smoke.test.mjs            UNCHANGED
icons/                      UNCHANGED
START-HERE-BG.md            UPDATED Android instructions
README.md                   this guide
```

The PWA/Capacitor conversion path still relies on exporting a JSON backup in the PWA, then importing it into the future APK. The Android APK has a separate storage origin, and does **not** automatically share Chrome's IndexedDB.
