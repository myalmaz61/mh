/** Shared protection for whole-collection IndexedDB writes (v3.9.0).
 * A snapshot mismatch is an error, never a reason to overwrite newer data.
 */
export const sameMetaSnapshot = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export function metaSaveErrorKey(error) {
  if(error?.code === 'stale-meta') return 'metaSaveConflict';
  if(error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22) return 'metaSaveQuota';
  return 'metaSaveFailure';
}

/** Require a conscious decision before leaving a screen with a failed save. */
export function mayLeaveAfterFailure(element,t,confirmAction){
  return !element.querySelector('[data-meta-save-warning]') || confirmAction(t('metaLeaveAfterFailure'));
}

/** Persistent, accessible error message. Does not re-render or clear editable inputs. */
export function showMetaSaveError(element,t,error){
  element.querySelector('[data-meta-save-warning]')?.remove();
  const parent=element.querySelector('.tool-head') || element;
  const warning=element.ownerDocument.createElement('p');
  warning.className='hub-meta-save-warning warning-text';
  warning.setAttribute('role','alert');
  warning.dataset.metaSaveWarning='1';
  warning.textContent=t(metaSaveErrorKey(error));
  parent.insertAdjacentElement('afterend',warning);
}
