# MyHub — Personal Tools v0.9.0

Local-first Android-friendly PWA hosted on GitHub Pages. No account, server, subscription, API key or build step required for PWA installation. Primary language: Bulgarian, optional English.

## What's new in v0.9.0

- **Today**: compact, collapsible read-only summary on Home of pending Tasks due today or overdue and Calendar events for the current day. Includes daily/weekly/monthly/yearly recurring events. Hidden when no items exist. Buttons open Tasks and Calendar.
- **Local data health**: Settings section showing numbers of Notes, Tasks, Calendar events and Bookmarks; browser-reported origin-wide storage usage/quota and whether persistent storage is confirmed.
- **Export timestamp**: after a JSON backup export is initiated, MyHub records the last *prepared export* timestamp in local metadata. This does **not** confirm a file was saved by Android; check Downloads yourself. The timestamp is not required by JSON Backup/Restore.
- Updated data backup descriptions so they mention Football, RSS and Bookmarks.
- Existing IndexedDB `myhub-local` schema version **1**, stored keys, favourite tiles and modules are not migrated or cleared.

## Important design limits

- The Today summary is **not** a notification system, background alarm or new calendar. Due-date items remain controlled by Tasks and recurring events remain controlled by Calendar.
- Local data health is read-only. It validates Tasks, Calendar and Bookmarks before reporting counts. It never repairs or deletes records silently. Quota/usage are browser estimates for the **web origin**, not exact MyHub-only data. On a shared `github.io` origin, the estimate may include other sites/apps.
- An OS/browser can still remove unprotected local data. Use JSON Backup and check the downloaded file.
- The PWA and any future Capacitor APK have distinct local storage; transfer is through explicit JSON Export/Import. Do not install an APK expecting data to appear automatically.
- All external services from earlier releases keep their old behavior and limitations.

## Installation and upgrading

See `START-HERE-BG.md` for full Android-only GitHub instructions. Update from v0.8.0 using the update-only ZIP, without uninstalling the PWA or clearing site data. Make a JSON backup **before** updating.

## Developer checks

- `npm test` (Node built-in test runner, no `npm install`) — **92/92 tests passed**.
- JavaScript syntax verified with `node --check`.
- Today and Diagnostics panels tested in an isolated mobile Chromium page with simulated local data, including button navigation and HTML escaping.
- Full PWA navigation test in the container's Chromium is blocked for local HTTP URLs by its environment. Real Android Chrome PWA needs verification after GitHub Pages deployment. Direct external API access is not part of the v0.9.0 changes.

## Suggested future development (not included)

- Universal search covering tools and personal content, with explicit privacy-safe results.
- Quick Add for Notes, Tasks and Bookmarks.
- Share to MyHub from Android (test PWA share target separately and maintain a browser fallback).
- Shortcuts for favourite unit conversions, Text Counter, small Random Generator.
- Optional Capacitor Android builds in GitHub Actions **after** PWA reliability review; no Android Studio required on the phone, but build/test checks are still necessary.
