# MyHub — Personal Tools v0.8.0

A free, local-first, mobile-first personal toolkit. Designed for Android Chrome and GitHub Pages, with no build step, subscription, paid API, server, account, advertisements or trackers. The interface supports Bulgarian and English, light/dark/automatic themes, configurable favourites and offline use where possible.

## New in v0.8.0 — Everyday Utilities

1. **Unit Converter:** length, mass, volume, area, speed, temperature and data size. Supports the decimal comma, UK gallons/pints (clearly labelled), metric/imperial units, swap, and copy result. Data units distinguish 1000-base MB from 1024-base MiB. No network and no saved history.
2. **Date Calculator:** calculate calendar days and weekdays (Monday–Friday), optionally including the end date; add or subtract calendar days from 1900 to 2100. Uses UTC-midnight internally to avoid DST arithmetic errors. Weekday counts **do not exclude public holidays**. No saved history.
3. **Percentage Calculator:** A% of B, A as a percent of B, percent change, increase/decrease and add/remove a user-selectable VAT rate (default 20% for those operations). It is a mathematical tool, not an accounting or tax-classification service. No saved history.
4. **Bookmarks:** up to 500 saved links with categories, search, favourites, editing and deletion. Only HTTP(S) links without embedded usernames/passwords are allowed; links open in a new browser tab. The list works offline but opening a website needs internet. All bookmark data is local and included in JSON backup.

These four tools appear in **All tools**. You can add any of them to the home screen using **Settings → Favourites**, without adding clutter by default.

## Existing tools preserved

Calculator, World Clock, Notes, Weather, Timer/Stopwatch, Calendar, Tasks, Quick Checklists, Football Scores and RSS Reader are left intact. Existing files not mentioned in the update list are byte-for-byte unchanged from v0.7.0. The RSS public cache workflow remains optional and is not enabled by this upgrade.

## Data and updates

- IndexedDB name remains `myhub-local`, schema version **1**. No database reset, deletion, or schema migration.
- The new `bookmarksData` value uses the existing `meta` object store, validated on read and before backup/restore. Corrupt bookmark records are **not silently reset**.
- `JSON Backup` now includes `bookmarksData` as well as every existing module's data. Backups created in v0.1 through v0.7 remain importable. **Any restore replaces all current module data**, and an older backup with no bookmarks will replace the current bookmarks with an empty list. Export a fresh v0.8 backup first.
- Other three new calculators are stateless and contain no private data to back up.
- PWA service-worker cache is bumped to `myhub-shell-v0.8.0`. It caches all module code and styles for offline use, without adding the external weather/football/RSS API responses to the shell cache.

## GitHub Pages layout

All files are directly publishable (no `npm install`, no compilation, no Android Studio):

- `index.html`, `utilities.css`, `styles.css` and other tool CSS at repository root.
- `js/utilities.js` — mobile UI for converter, dates and percentages.
- `js/unit-core.js`, `js/date-core.js`, `js/percent-core.js` — separate tested arithmetic logic.
- `js/bookmarks.js` and `js/bookmarks-core.js` — local bookmarks UI and validation.
- `js/config.js`, `js/app.js`, `js/i18n.js`, `js/db.js` — minimal navigation, labels and backup integration.
- `sw.js` and `manifest.webmanifest` — offline installation.
- `tests/*.test.mjs` — local Node.js built-in tests (optional, useful through GitHub Actions in future). No Node installation needed on the phone.

See `START-HERE-BG.md` for Android/GitHub instructions. Use the UPDATE-ONLY archive for an existing v0.7.0 repository; use the full ZIP for a new repository. Do not upload the ZIP itself as a website file.

## Verification and limitations

- **82 automated tests** passed in Node.js, including existing-module regression tests, new unit/date/percentage calculations, invalid URLs and backward-compatible JSON backup parsing. Source syntax and files were also checked before packaging.
- Chromium in the current environment blocked navigation to the locally served PWA (`ERR_BLOCKED_BY_ADMINISTRATOR`), so **full PWA/Android navigation, actual IndexedDB UI persistence and service worker installation have not been verified here**. Test these on the Android phone after deployment.
- Converter calculations use standard conversion constants and floating-point arithmetic; for financial totals, round to the appropriate number of decimal places.
- No background notifications are introduced by these utilities.
