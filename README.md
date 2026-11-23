# MyHub — Personal Tools v2.4.0

Local-first Android-friendly PWA, hosted for free on GitHub Pages. No account, paid API, advertisements, analytics or server required. UI in Bulgarian and English.

## v2.4.0 — Football results: more honest status + recovery

This release responds to the real-world issue of a match that was played on Saturday or Sunday still appearing as unconfirmed on Monday.

- Explain missing final results clearly: for matches whose scheduled kickoff is at least **six hours** in the past and that have no *confirmed final result* from OpenLigaDB, show an informative label, rather than promising a live score.
- Count potentially missing results among matches scheduled in the **past ten days** for the selected competition. The label is based on **cached/provider records**, not an independent claim about whether a match really took place. Postponements remain possible.
- Allow a user-initiated **Check this match** using OpenLigaDB's single-match API endpoint. Each match is subject to a **two-minute cooldown per screen session**. The provider may still have no result.
- Allow explicit **Search for result in browser** as a fallback. This opens a Google search on demand; no information is transmitted until the user chooses it. This does **not** automatically import results into the app.
- When the provider temporarily sends a shorter fixture list, merge valid new data with the older local cache instead of discarding the entire response or erasing previously confirmed scores. A genuinely empty response leaves the previously cached list untouched.
- Keep existing OpenLigaDB fair-use refresh intervals (4/12/120 minutes as appropriate while the Football screen is in use). No extra background polling, API keys or alternative undocumented APIs.

Other tools (Notes, Weather, Tasks, Calendar, RSS and the rest) retain their existing functions and storage. No IndexedDB migration, no change to backup schema.

## Limitations

OpenLigaDB is maintained by community contributors. Some league data can be delayed, incomplete or wrong. More frequent requests and the single-match check cannot create results that do not exist in the provider. The external search is an explicit manual fallback and is not evidence that the provider has updated. A result is only labelled confirmed if the source has reported the match as finished and published a numerical score. Consult https://www.openligadb.de/en/terms-of-use for the API's fair-use guidance and accuracy limitations.

## How to update

Use `MyHub-v2.4.0-UPDATE-ONLY.zip` on an existing **v2.3.0** repository. Use the full project ZIP only for a new installation or a full-repository replacement. Check the exact files in `CHANGED-FILES.txt` (inside the update ZIP) and follow `START-HERE-BG.md` for phone-only Android/GitHub instructions.

Before updating, create a **JSON Backup** and check that the downloaded `.json` file exists. Do **not** uninstall the current PWA or clear Chrome site storage.

## Tests

Run `npm test` in a Node.js environment (such as GitHub Actions); `node --check` checks JavaScript syntax. Tests cover the new data merge, outdated provider results, manual single-match checks, translated labels, legacy backups and previous tools. Actual Android Chrome behavior and current upstream result availability still require real-device verification.

## Future APK

The longer-term Capacitor/GitHub Actions plan remains in `APK-READINESS-BG.md`. PWA and APK do not automatically share local storage: export JSON from the PWA and restore it into the APK after explicit validation.
