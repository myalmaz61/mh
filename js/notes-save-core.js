/**
 * Serial, revision-aware note writes. The editor must never claim "Saved" until
 * IndexedDB has committed the latest revision. A failed write keeps the draft
 * in memory and permits an explicit retry without removing the editor.
 * No localStorage mirror: a quota error may affect both stores.
 */
export function isQuotaError(error) {
  return error?.name === 'QuotaExceededError' ||
    error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22;
}

export function createNoteSaveManager({write, onChange=()=>{}}) {
  if (typeof write !== 'function') throw new TypeError('Missing note writer');
  let revision = 0;
  let committedRevision = 0;
  let latest = null;
  let pending = null;
  let error = null;
  const state = () => ({
    dirty: revision > committedRevision,
    saving: pending !== null,
    error,
    quota: isQuotaError(error),
  });
  const publish = () => onChange(state());

  const mark = draft => {
    if (!draft || typeof draft.id !== 'string' || !draft.id) throw Error('Invalid draft');
    latest = structuredClone(draft);
    revision += 1;
    error = null; // a new revision may be saved on the normal debounce
    publish();
  };

  async function saveNow() {
    // A previous write must finish before we attempt a newer snapshot.
    if (pending) {
      await pending;
      if (error) return false;
    }
    if (revision <= committedRevision) return true;
    if (!latest) return false;
    const snapshot = structuredClone(latest);
    const savedRevision = revision;
    error = null;
    const operation = (async () => {
      try {
        await write(snapshot);
        committedRevision = Math.max(committedRevision, savedRevision);
      } catch (cause) {
        error = cause instanceof Error ? cause : new Error(String(cause));
      }
    })();
    pending = operation;
    publish();
    await operation;
    if (pending === operation) pending = null;
    publish();
    if (error) return false;
    // Edits made during the write get their own, later commit.
    if (revision > committedRevision) return saveNow();
    return true;
  }

  return {mark, saveNow, state};
}
