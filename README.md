# MyHub — Personal Tools v0.1.0

**Personal PWA, mobile-first, Bulgarian and English, without accounts, advertising or paid APIs.**

## What's included

- Simple home screen with local clock, search, customisable favourites and reorder controls.
- Calculator: arithmetic, parentheses, percentage (`200 + 10% = 220`), 30 most recent results, copy.
- World clock: 14 cities, DST via IANA time zones, London difference, saved city list.
- Notes: text, checklists, title, search, pin, favourites, auto-save, permanent delete.
- Light / dark / automatic theme, Bulgarian / English, locally saved preferences.
- IndexedDB, validated JSON backup and atomic restore.
- Static PWA assets cached offline; versioned Service Worker; installable PNG icons.

## Publish only with an Android phone

1. In the mobile browser open https://github.com/new, and create a **public** repository `myhub` with NO starter README (this archive already contains it).
2. Extract `MyHub-v0.1.0.zip` on your phone.
3. Open your repository, use **Add file → Upload files** (enable Chrome **Desktop site** if necessary), upload the contents of the `MyHub-v0.1.0` folder **to the repository root**, preserving the `js`, `icons` and `tests` folders. If the upload interface flattens folders, use GitHub's web editor to create each file by its exact path (e.g. `js/app.js`). You can also use a free GitHub-capable Android Git client to upload a directory tree.
4. Commit the files. Check that `index.html` and `sw.js` are at the repository root.
5. Repository **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.
6. Open `https://YOUR-USERNAME.github.io/myhub/` in Android Chrome. Use Chrome menu **⋮ → Add to Home screen → Install** if available.
7. Test a note, calculation, clock and backup. Download a JSON backup regularly.

No npm install, API key, server or Android Studio needed. The `package.json` is only for optional automated developer tests using `npm test` on another device or GitHub Actions.

## Local storage and privacy

Storage is **browser-origin-specific** (IndexedDB `myhub-local` version 1, stores `notes` and `meta`). Data is not written to GitHub. Clearing site data or uninstalling your PWA can remove it. Request browser persistent storage in Settings, but the browser may deny this. Keep JSON exports somewhere safe.

A restore validates the JSON first, asks for confirmation, then **replaces** notes, settings and history in one IndexedDB transaction; a failed transaction rolls back. The restore does not merge. Copy the current data to JSON before any restore.

The PWA and a future Capacitor APK will have different storage origins. Move data between them using **Export JSON → Import JSON**. No automatic sync is promised.

## Developer architecture

- `index.html`, `styles.css`, `js/app.js`: UI shell and navigation.
- `js/config.js`, `js/i18n.js`, `js/utils.js`: version, tools, translations and helpers.
- `js/db.js`: versioned IndexedDB, JSON backup validation and atomic restore.
- `js/calculator.js`, `js/world-clock.js`, `js/notes.js`: independent tools.
- `manifest.webmanifest`, `sw.js`, `icons/`: PWA installation and offline app shell.
- `tests/`: automated pure-function tests. No external dependencies.

**Caveats:** Service Workers only run over HTTPS (GitHub Pages is HTTPS), or localhost for development. Notifications and reliable background timer alarms are not implemented. Weather, football and RSS are deliberately deferred so no external or unreliable API dependencies are present in v0.1.

Future deployments: update version references in `js/config.js`, `package.json`, and `sw.js` cache name, then deploy complete changed files; keep the same IndexedDB name and migrate schema instead of clearing data. Clear caches in the service worker only; NEVER clear IndexedDB or all browser storage on update.

## Manual check on Android after publishing

1. Open **Calculator**: enter `200 + 10%`, tap `=` and check for `220`. Leave the calculator and come back: the history should still be present.
2. Open **Notes**: add a title and text, wait until "Запазено локално", close/reopen the PWA and check the note. Make a checklist and tick one item.
3. Open **World clock**: add Tokyo and remove a city. Reopen and check that your selection remains.
4. Open **Settings**: select Dark and English, change the order of favourites, reopen and check they persist.
5. Download a JSON backup. Make a temporary note, then restore the downloaded archive **only if replacing current data is what you intend**. Check the notes, theme, cities and calculator history after restore.
6. Once the PWA has fully opened online, switch Android to airplane mode and reopen the installed PWA: calculator, notes and clock should load offline. Note that initial installation needs an internet connection.

Browser storage is **not a second backup**. Consider storing the exported JSON in a safe personal location.

## Mobile GitHub upload tips

GitHub does not automatically unpack a ZIP uploaded to a repository. Extract it with Android's Files app first. The simplest browser-only route is:

- Upload the root files (`index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `README.md`, `package.json`, `.nojekyll` if visible) through **Add file → Upload files** at repository root.
- To create each subfolder if absent, choose **Add file → Create new file**, name it e.g. `js/.gitkeep`, commit; open the new **js** folder and upload all `.js` files there. Repeat for **icons** (the PNG images) and **tests** (the `.mjs` file).
- If your browser does not show **Add file**, in Chrome use **⋮ → Desktop site**. Check paths on GitHub after each commit. A PWA with wrong file paths cannot start.

These instructions use GitHub only and do not require Android Studio, an API account, npm installation or a computer.
