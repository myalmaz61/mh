# MyHub — Personal Tools v0.7.0

Free, local-first Android PWA for personal use. No paid APIs, servers, ads, accounts, trackers or mandatory cloud storage. Designed for Android Chrome and GitHub Pages.

## Included tools

Calculator, World Clock, Notes, Weather (Open-Meteo), Timer / Stopwatch, Calendar, Tasks, Quick Checklists, Football Scores (OpenLigaDB) and **RSS Reader**.

## RSS Reader in v0.7.0

- Subscribe to up to 40 **public HTTPS RSS 2.0 / Atom sources**. Categories are stored per feed.
- Fetch directly where the provider allows browser cross-origin requests (CORS). MyHub cannot bypass CORS and does not depend on a public proxy.
- Browse the latest saved articles; mark read/unread, star, save to Read Later, filter by source/category, and search.
- Open original article in the browser with `noopener noreferrer` and no referrer header. The reader displays escaped plaintext summaries, not remote HTML or embedded widgets.
- **OPML export/import** for sources and categories. OPML does not contain articles or reading history.
- **XML import** of a previously downloaded RSS or Atom file into one selected feed: useful when the browser is blocked by CORS. This is manual, not an automatic refresh.
- **Optional public GitHub Actions cache** (see below) for public feed subscriptions. This is a separate opt-in setup, not necessary to use MyHub. Nothing from your device is uploaded to GitHub automatically.
- The last successful articles and read/starred/read-later flags stay in IndexedDB and remain visible offline. Offline cannot fetch new articles.
- RSS has a cap of 100 articles per feed fetch, 1,600 cached articles overall, 2 MB XML per feed, and 40 subscriptions. Saved/starred items have pruning priority; the 1,600-entry limit still applies.

## Important CORS details

A static site on GitHub Pages cannot read arbitrary RSS websites that disallow cross-origin fetches. `mode:'no-cors'` does **not** fix this because it returns an unreadable response. For those sites use the manual XML import, or enable the optional public GitHub Actions cache. No free third-party proxy is required.

### Optional public GitHub Actions cache — not enabled by default

The file `rss-public-feeds.json` starts with `"feeds": []`. If you explicitly list **public HTTPS RSS addresses** in this file, `scripts/rss-public-cache.py` can fetch them on a GitHub-hosted runner (Python standard library only) and write `rss-public-cache.json` for the static site. The RSS screen has a button **Public GitHub cache** to merge only URLs that match feeds you've already added locally.

The example workflow lives at `_optional/rss-pages.yml`. It is **not active** until copied to `.github/workflows/rss-pages.yml`, and GitHub Pages is changed to **GitHub Actions** as publishing source. This workflow publishes the site and refreshes the public cache at scheduled times and on `main` pushes. This changes the Pages deployment method; do it only if you are comfortable with the optional setup. Scheduled jobs are best effort, may be delayed, and can be disabled after 60 days of public-repo inactivity. An empty or failed public feed fetch doesn't erase local RSS articles.

**Privacy:** The feed URLs in `rss-public-feeds.json` and cached article metadata on GitHub Pages are public. **Do not put private subscriptions, credentials, tokens, passwords or personal feed addresses into public configuration files.** All local read/starred/read-later state stays on your phone; it is never included in the public cache.

## Storage and backup

- Existing IndexedDB `myhub-local`, version **1** (no schema upgrade or data deletion).
- New `meta` key: `rssData` (validated before accepting restore; preserved by v0.7 backup).
- Existing Notes, Weather, Timer, Calendar, Tasks, Quick Checklists, Football, settings and Calculator History still use their existing data stores/keys.
- **JSON Backup/Restore** includes RSS articles and reading flags, as well as everything from previous versions. v0.1–v0.6 backups remain importable and give RSS an empty default. Restore **replaces every current tool's data**: export a new JSON backup first.
- **OPML** is deliberately different from JSON Backup: it exports only public source URLs, categories and titles.

## Structure and how to deploy

- Root: `index.html`, stylesheets (including `rss.css`), `manifest.webmanifest`, `sw.js`, `rss-public-feeds.json`.
- `js/rss-core.js`: RSS/Atom/OPML parsing, model validation and merge helpers.
- `js/rss.js`: independent RSS interface, direct fetch, manual XML import and optional public cache.
- `js/config.js`, `js/db.js`, `js/app.js`, `js/i18n.js`: minimal integration changes.
- `_optional/rss-pages.yml` and `scripts/rss-public-cache.py`: OPTIONAL public-cache workflow (inactive by default).
- `tests/rss.test.mjs`: unit tests with the Node built-in runner; Node not required on Android.
- `icons/`, other JS modules and CSS: all unchanged from v0.6.0.

To update from v0.6.0, use `MyHub-v0.7.0-UPDATE-ONLY.zip`. Upload the complete changed files to the same paths in the same GitHub repository, preserving the existing Pages URL and app installation. Do not clear Android Chrome/PWA storage. See `START-HERE-BG.md` for Android-first instructions.

## Tests and limitations

The Node test suite checks previous module regressions, new RSS data/backup validation, and optional shell integration. XML RSS/Atom/OPML parsing and RSS UI interactions were separately checked in a Chromium DOM with synthetic content and simulated local storage. **A full Android Chrome PWA integration and real external RSS API/CORS test could not be performed in the test environment.** Validate publication on your own device, ideally with a known CORS-enabled source or downloaded XML sample.
