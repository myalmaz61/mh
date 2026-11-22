# MyHub — Personal Tools v2.2.0

Mobile-first local-first PWA, designed for Android Chrome + GitHub Pages. No account, server, advertising, paid APIs or build step is required.

## What changed in v2.2.0

This is a **small usability release** for the existing Today summary. It does not introduce new tools or make the home screen busier.

- The collapsed **Today** details list now includes **✓ Готово / Done** on pending due/overdue tasks. Tapping it completes exactly that task in Tasks; the row disappears on refresh. Completed tasks are still available through Tasks and JSON backup.
- A calendar item includes **Отвори / Open**, which opens the correct **day view** in Calendar. For recurring events this is the occurrence date shown in Today, not necessarily the first date of the series. Opening does **not** start editing the series.
- Both buttons are placed **inside the existing collapsed details**. The first four tasks and first four events are displayed; the existing full Tasks and Calendar buttons remain.
- Completing a task uses one IndexedDB **readwrite transaction**. The selected task's `updatedAt` must still match; otherwise the change is refused and the Today summary is refreshed, rather than overwriting edits from another tab/screen.
- The panel preserves its expanded/collapsed state on refresh. Labels work in Bulgarian and English. Titles are HTML-escaped.

## Compatibility

- App version: `2.2.0`; PWA offline cache: `myhub-shell-v2.2.0`.
- IndexedDB database: `myhub-local`, **schema version 1**. No database migration.
- JSON Backup **format 1**: unchanged. All existing notes, tasks, calendar events, settings, favourites, and other tools are retained.
- No new permissions, network services, background alarms, or data synchronisation.
- All other modules and the home screen layout remain unchanged.

## Test status

`npm test` (Node.js 20+): **262 of 262 tests passed**. This includes 15 new tests for the Today action logic, stale records, damaged data, atomic database writes, and recurring event selection. JavaScript syntax and offline manifest assets were checked.

An **isolated mobile Chromium widget test** passed for showing the controls, opening a recurring event on its selected day and completing a task while preserving the expanded details; the test used stubbed local data. Loading the complete PWA through the local Chromium browser was blocked by the environment. The full installed Android PWA must be checked after publishing.

## Files and installation

- `MyHub-v2.2.0-UPDATE-ONLY.zip`: only new/modified repository files compared with v2.1.0, plus `CHANGED-FILES.txt`.
- `MyHub-v2.2.0.zip`: complete repository, with relative paths directly from its root.
- `MyHub-v2.2.0-FULL-SOURCE.md`: full text of every new or changed text file.

**IMPORTANT:** Before uploading, export and verify a JSON backup from your existing PWA. Do not uninstall the PWA or clear Chrome site data. The ZIP itself must be extracted and individual files uploaded into their matching GitHub folders.

Detailed Android-only instructions: `START-HERE-BG.md`.
