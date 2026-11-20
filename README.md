# MyHub – Personal Tools v0.6.0

**Free, local-first Android PWA hosted on GitHub Pages.** No private API keys, servers, ads, trackers, sign-in, Node build, Android Studio or paid services.

## Tools

Calculator, World Clock, Notes, Weather (Open-Meteo), Timer / Stopwatch, Calendar, Tasks, Quick Checklists, **Football Scores**.

## Football Scores v0.6.0

- Uses `https://api.openligadb.de` with no authentication or API key.
- Starts with German Bundesliga 2026/27. Use **+ Добави първенство** to select other leagues actually listed by the provider for the current or adjacent seasons. Data coverage varies and is not guaranteed, particularly for Premier League and other leagues maintained by community volunteers.
- See scheduled matches, completed matches and results if published, plus a separate **★ Любими** view of cached matches involving starred teams.
- The ★ button beside a team adds/removes it from favourites.
- Times display in the phone's current local timezone; no permissions needed.
- If a match is not officially marked finished, the app **never asserts LIVE**: it may indicate "possibly playing, unconfirmed" based on kick-off time. Scores are never fabricated.
- Refreshes politely: up to every two hours while the screen is open outside possible matches, plus manual refresh no more than once every 30 minutes (or 90 seconds if a match may be playing). During an ongoing match, it can poll the provider's cheap `getlastchangedate` endpoint about every 90 seconds, fetching the season again only if a change is detected. This depends on provider coverage and is not a guaranteed real-time live service.
- Cached matches remain visible offline; there are no offline updates.
- No third-party team crests: their image rights are not guaranteed under the source data licence.
- Attribution: Data from [OpenLigaDB](https://www.openligadb.de/), licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). See their [API terms](https://www.openligadb.de/en/terms-of-use) and [data licence](https://www.openligadb.de/en/license).

## Storage / backup

`myhub-local`, IndexedDB version **1** (unchanged). Football match caches and starred teams are in the existing `meta` store under `footballData`. League catalogue cache is a separate, rebuildable `footballCatalog` entry. v0.6 JSON backups include `footballData` with strict validation. v0.1–v0.5 backups continue to import: the Football section defaults to its initial state. **Restore overwrites all current MyHub data**, so export a fresh backup first.

## File layout

- `index.html`, `styles.css`, `weather.css`, `timer.css`, `calendar.css`, `tasks.css`, **`football.css`** — layout.
- `js/app.js`, `js/config.js`, `js/db.js`, `js/i18n.js`, `js/utils.js` — app shell and local data.
- Existing tool modules remain independent.
- **`js/football-core.js`** — source data parsing, validation and filters.
- **`js/football.js`** — Football UI, caching, network requests and favourites.
- `manifest.webmanifest`, `sw.js`, `icons/` — PWA installation and offline shell.
- `tests/*.test.mjs` — Node built-in test runner; `npm test` is optional and not needed on Android.

## Publish / upgrade

1. Back up your current v0.5.0 data via Settings → JSON Backup.
2. Extract `MyHub-v0.6.0-UPDATE-ONLY.zip` and upload the **complete changed files** to their matching GitHub folders, preserving exact filenames.
3. Keep the same GitHub Pages origin/URL. Do not uninstall the PWA or clear site data.
4. Wait for GitHub Pages deployment, open MyHub, accept the service-worker update if offered, verify `v0.6.0` in Settings.
5. See `START-HERE-BG.md` for complete Bulgarian Android instructions and a verification checklist.

**Caution:** This version passes automated tests of JavaScript logic and previous module regressions, but the test environment does not permit a complete browser/PWA launch. Verify on your Android Chrome after publication. Network availability and football data completeness depend on the independent API provider.
