# MyHub — Personal Tools v2.1.0

Local-first, free, standalone, mobile-friendly PWA for Android Chrome and GitHub Pages.

## What changed in v2.1.0

This release introduces **contextual Quick Add drafts** without linking or migrating existing records:

- **Tasks → Calendar**: From an individual task, choose “В календар” / “To Calendar”. The task title, details, and due date (or today's local date if undated) are copied to a **new, unsaved Calendar draft**.
- **Calendar → Tasks**: From the selected calendar occurrence, choose “Нова задача” / “New task”. The event title and details are copied into a **new, unsaved task draft**. For repeating events, the date you are viewing is used as the task due date.
- **Notes → Tasks**: From the open note, choose “Нова задача” / “New task”. The existing note is saved first; the title and body (or unchecked checklist items) become a **new, unsaved task draft**.

Nothing is automatically created or linked. To create the new record, the user must tap **Save** in Quick Add. Cancel leaves the existing data untouched. Drafts with text longer than the target field display a visible warning and show the shortened content for review.

## Files and compatibility

- Version string: `2.1.0`
- IndexedDB: `myhub-local`, database version **1** (unchanged)
- JSON backup: format **1** (unchanged)
- PWA offline cache: `myhub-shell-v2.1.0`
- New shared helper: `js/cross-actions-core.js`
- New tests: `tests/cross-actions.test.mjs`
- All original tools, notes, tasks, events, settings, weather and feeds are retained.
- No paid services, new API keys, third-party code, trackers, or new device permissions.

## Installation and updates

See `START-HERE-BG.md` for Android-only instructions. Use `MyHub-v2.1.0-UPDATE-ONLY.zip` to update an existing v2.0.0 GitHub Pages project, or `MyHub-v2.1.0.zip` for a fresh copy of every project file. ZIP contents are **repository-relative paths**, not a nested root folder.

Before uploading, export and verify a current JSON backup from the existing PWA. Do **not** uninstall the PWA or clear Chrome website data while updating.

## Tests

Run `npm test` (Node.js 20+). This is not required on your Android phone: tests were run when preparing this release. All 247 automated tests passed, including 14 dedicated cross-tool tests. Every JavaScript file passed `node --check`. All 68 Service Worker assets were present. The full installed Android PWA and its share-target registration have not been independently tested on a physical Android device; verify after publishing.

## Known limitations

- Shortcuts create an independent copy, not an automatically synchronized relation. Changes to the original record will not affect the new one.
- A task without a deadline uses today's date when converting to an event; you may change it before saving.
- A recurring Calendar item uses the *selected occurrence date* when converting to a task. It does not create a repeating task.
- Target fields have length limits; the app warns before saving if content needed to be shortened.
- Background alarms in PWA are not guaranteed by Android.
