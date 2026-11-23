# MyHub — Personal Tools v3.0.0

Local-first Bulgarian/English Android-friendly PWA for GitHub Pages. No account, paid API, server or build step required for deployment.

## New in 3.0.0: persistent Notes Trash

- **Notes → Кошче / Trash**: keeps deleted notes and checklists after closing or restarting the PWA.
- Restore the **original record**, including checklist ticks, pinned/favourite flags, timestamps and ID.
- One-tap Undo remains immediately after deletion, but deleted notes now also remain in Trash.
- **Delete forever** (one record) and **Empty Trash** (all records) require explicit confirmation. Trash is never emptied automatically.
- Maximum 100 deleted notes. When full, deleting another note is refused; no automatic eviction.
- Deletion/restore use one IndexedDB transaction across `notes` and `meta`; invalid/corrupt data and stale-editor edits abort without writes. Restore never overwrites an existing ID.
- JSON Backup **format 1** now includes `notesTrashData`. Existing older archives remain valid; restoring an older archive will replace the current trash with an empty one, after a preview warning.
- Restore preview compares deleted notes as a separate category.

## Technical choices

- Same IndexedDB name `myhub-local`, **version 1**; no database upgrade or migration.
- New meta key `notesTrashData` with `{schema:1,items:[{note,deletedAt}]}`.
- New module `js/notes-trash-core.js` validates every deleted record.
- Service worker cache `myhub-shell-v3.0.0` precaches the new module.
- Football (including SportScore), Weather, and all other existing modules are **unchanged**.

## Testing

Run `npm test` using Node 22+ to exercise all old and new tests (no npm install needed). The new tests include a transactional fake IndexedDB and cover atomic deletion, restoration, corrupt data, ID collisions, old JSON files, and trash in the restore preview.

The automated tests do not substitute for manually checking the installed PWA on Android Chrome. See `START-HERE-BG.md` for a safe test using a disposable note.

## Files

Use `MyHub-v3.0.0-UPDATE-ONLY.zip` only when upgrading the existing v2.9.0 files. Use the complete ZIP for a new repository. `APP-FILES-ONLY.txt` lists the minimal files to publish via Android + GitHub. Other modules and data must not be deleted.
