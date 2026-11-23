# MyHub — Personal Tools v2.3.0

A free, local-first Android Chrome PWA hosted on GitHub Pages. No account, server, private API key, subscription, advertising, or build step required. This release builds directly on v2.2.0, retaining **all 16 existing tools** and the uncluttered home screen.

## What's improved in v2.3.0

### Notes — faster everyday actions

- **Copy** copies the note's title and text, or a readable checklist with `[ ]` and `[x]`, to the Android clipboard. The action may require clipboard permission and a secure context (GitHub Pages provides HTTPS).
- **Duplicate** makes a separate note with a fresh ID (and fresh checklist-item IDs), retains content and checked states, but does **not** inherit pin/favourite flags. Nothing is deleted from the original.
- A pending edit is saved before either operation; on a save failure the action is stopped.
- Both actions are within the existing editor. No home-screen additions and no new persistent storage format.

### Weather — quick rainfall probability

- A small line above the daily forecast displays the **highest forecast probability of precipitation** from up to the next three available hourly entries, sourced from the already cached Open-Meteo response.
- This is **not** a claim that rain will occur or an emergency weather warning. It introduces **no additional API requests**, and works with already saved forecasts offline.
- Existing hourly and seven-day forecasts are preserved without schema changes.

### Football — match-aware refresh

- The original v2.2.0 refresh policy could wait **two hours for automatic updates** and **30 minutes for manual ones** outside the short possible-live window.
- With v2.3.0, while the Football screen is open and the phone is online:
  - **Unfinished match up to 4 hours after kickoff:** scheduled automatic refresh every **4 minutes** at most, and manual refresh every **90 seconds** at most; a changed-data signal from the inexpensive OpenLigaDB endpoint can trigger an earlier full refresh when permitted.
  - **Around kickoff, recent finals, or late unconfirmed matches:** automatic **12 minutes**, manual **3 minutes**.
  - **Quiet periods:** automatic **2 hours**, manual **10 minutes** to respect OpenLigaDB fair-use guidelines.
- The inexpensive OpenLigaDB `getlastchangedate` check is retained, throttled to **90 seconds**, as a supplementary check around possible live matches. A provider update can trigger a full refresh sooner than the scheduled four-minute check; MyHub still applies the manual cooldown.
- Existing source timestamps, cached scores, conservative match status and error backoff remain. A displayed score can still be **delayed at source**, and an unconfirmed status is **not** labelled verified live.
- **No new provider or API key** has been added. OpenLigaDB explicitly recommends caching, inexpensive change-date polling and few requests outside live play: https://www.openligadb.de/en/terms-of-use

## Backward compatibility and privacy

- IndexedDB remains `myhub-local`, schema version **1**. JSON Backup remains **format 1** and includes all tools' existing data.
- No migration, login, advertising, analytics, background permissions, or account connections.
- PWA service worker cache is renamed to `myhub-shell-v2.3.0` and includes the three new pure helper modules.
- Old archived data and user favourites are not modified by this release.

## Automated checks

The command `npm test` passes **274 of 274 automated tests**, covering legacy modules and new note, weather and football cases. Syntax, assets and ZIP structure are also checked in the release preparation. Browser / physical Android integration testing is not claimed as completed; test with your actual PWA after publishing.

## Installation

- `MyHub-v2.3.0-UPDATE-ONLY.zip` contains only new and modified repository files since **v2.2.0**, plus `CHANGED-FILES.txt`.
- `MyHub-v2.3.0.zip` contains the complete repository; no new repositories or accounts are needed.
- `MyHub-v2.3.0-FULL-SOURCE.md` contains full contents of every changed text file.

**Before uploading**, use MyHub Settings to export JSON Backup and verify the downloaded file exists. **Do not uninstall** the installed PWA or clear Chrome site data. Full Android-only upload and test instructions in `START-HERE-BG.md`.
