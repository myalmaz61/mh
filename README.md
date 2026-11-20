# MyHub — Personal Tools v0.2.0

A free, local-first, installable Android-friendly PWA built with static HTML, CSS and JavaScript. Main UI is Bulgarian, with an English option. No login, server, paid API, ads or trackers.

## What is new in v0.2.0

**Weather** is now the fourth tool, without changing the existing three:
- Open-Meteo forecast and geocoding APIs, directly from the browser (CORS-supported, no key for non-commercial personal use).
- Current modelled conditions: temperature, feels-like, humidity, wind and precipitation.
- Seven-day daily forecast with high/low temperatures, rainfall amount and chance of rain, plus upcoming hours.
- Search for places (choose the correct country/region); add or remove up to **eight** cities.
- Starts with Newport, Shropshire, UK as the default city; no geolocation permission is requested.
- Forecast refresh when opening Weather, revisiting it after inactivity or returning online; requests are generally limited to one per selected city per 30 minutes. Manual refresh available.
- Saves the last valid forecast in IndexedDB, showing a timestamp and stale indicator when appropriate. No invented data when offline or if an API request fails.
- Weather cities and cached forecasts included in validated JSON backups. **v0.1.0 format-1 JSON backups are still supported**.
- Weather is not pinned to Home automatically; enable it in Settings > Favourite tools.

This is model-based forecast data, not official severe weather warnings. Open-Meteo is independent of MyHub and may change its terms, quota or availability.

## Install or update from Android + GitHub Pages

**Already using v0.1.0?** Do not uninstall the PWA or clear Chrome storage. First export a JSON backup from Settings. Open [`START-HERE-BG.md`](START-HERE-BG.md) for precise Android-only update instructions and the file list.

**New installation?** Create a public GitHub repository (for instance `myhub`) and upload **the contents** of the full ZIP to the repository root, preserving paths. Enable Settings > Pages > Deploy from a branch > `main` > `/(root)`. Open `https://YOUR-USERNAME.github.io/myhub/` in Chrome and choose menu ⋮ > Add to Home screen > Install.

GitHub **does not unpack ZIP uploads**. Extract on your Android phone, then upload files to the repository root and corresponding folders (`js`, `icons`, `tests`). If GitHub mobile web hides file upload, use Chrome > Desktop site.

### Runtime structure

| File | Function |
|---|---|
| `index.html`, `styles.css` | Existing app shell and global styling |
| `weather.css` | New Weather-only stylesheet |
| `js/app.js`, `js/config.js`, `js/i18n.js` | Navigation, tools, preferences, translations |
| `js/weather.js` | New Weather module, Open-Meteo queries, seven-day view, cached forecasts |
| `js/db.js` | Existing IndexedDB database (`myhub-local`, version 1), format-1 backups and Weather storage |
| `js/calculator.js`, `js/notes.js`, `js/world-clock.js` | Existing tools, unchanged |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline app shell and installation |
| `tests/` | Dependency-free Node built-in tests (optional on GitHub Actions/PC; **not needed on the phone**) |

### Data and compatibility

Keep the **same GitHub Pages URL** to preserve existing origin-based data. Updating source files or replacing the Service Worker cache **does not clear IndexedDB**. The database version stays at 1, with `notes` and `meta` stores. Weather preferences use the existing `settings` entry and cached forecasts use `meta.weatherCache`.

Backup `format:1` is unchanged. A restore first validates the complete JSON and asks for confirmation. It **replaces**, rather than merges, existing notes, settings, calculator history, and weather cache in an atomic IndexedDB transaction. v0.1 files without the Weather properties restore correctly and get the default Weather location.

Clearing site storage, changing GitHub Pages host, or deleting the PWA may remove browser data. Keep a JSON backup separately. A future Capacitor APK will not automatically share PWA browser storage: transfer using JSON Export > Import.

Weather only needs internet for *fresh* forecasts and place searches. All other v0.1 tools and already fetched weather snapshots work offline. Service Worker deliberately only caches same-origin static files; external weather responses are stored selectively after successful validation in IndexedDB.

### Open-Meteo attribution and terms

Weather data: [Open-Meteo](https://open-meteo.com/), CC BY 4.0. Free public endpoints are for non-commercial use, subject to terms, fair-use limits and no uptime guarantee. Docs: https://open-meteo.com/en/docs and https://open-meteo.com/en/docs/geocoding-api . Forecast and location queries send selected city names/coordinates to Open-Meteo; no location access or account is necessary.

## Checks

- `npm test` (only where Node is available): 15 unit tests, zero npm dependencies.
- Manually on Android: app startup, original modules and data, adding a Weather city, refresh, offline cached forecast, backup/restore, and Settings version **v0.2.0**.
- An isolated Weather UI test in Chromium passed with mocked API data, including adding a city and displaying offline cached weather. A full interactive Android PWA check is still required after deployment; the authoring browser blocks local test-site navigation.
