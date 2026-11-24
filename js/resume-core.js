// v4.2: home continuation and conservative foreground update checks.
// Only tool identifiers are used; note text, drafts and search queries are never stored.
export const UPDATE_RECHECK_MS = 15 * 60 * 1000;

export function recentContinueTool(recentIds, tools, hiddenIds = []) {
  if (!Array.isArray(recentIds) || !Array.isArray(tools) || !Array.isArray(hiddenIds)) return null;
  if (recentIds.length > 5 || (recentIds.some(id => typeof id !== 'string') || new Set(recentIds).size !== recentIds.length)) return null;
  const hidden = new Set(hiddenIds);
  for (const id of recentIds) {
    const tool = tools.find(item => item?.id === id);
    if (tool && !hidden.has(id)) return tool;
  }
  return null;
}

export function shouldCheckForAppUpdate({now, lastCheckedAt=0, online=true, visible=true, waiting=false, inProgress=false}={}) {
  if (!Number.isFinite(now) || now < 0 || !online || !visible || waiting || inProgress) return false;
  if (!Number.isFinite(lastCheckedAt) || lastCheckedAt < 0) return false;
  return now - lastCheckedAt >= UPDATE_RECHECK_MS;
}
