/** MyHub v5.9: compare visible form contents with their last rendered values.
 * Does not write personal text to storage. The caller owns any confirmation.
 * This is a navigation guard, not crash recovery (Android may kill a PWA).
 */
export function snapshotFormValues(form) {
  if (!form || typeof form.querySelectorAll !== 'function') return null;
  const values = [];
  for (const field of form.querySelectorAll('input[name], textarea[name], select[name]')) {
    if (!field.name || field.type === 'hidden' || field.type === 'button' || field.type === 'submit') continue;
    // Disabled controls are included deliberately: they can later become enabled.
    const value = field.type === 'checkbox' || field.type === 'radio'
      ? Boolean(field.checked) : String(field.value ?? '');
    values.push([field.name, value]);
  }
  return values;
}

export function hasUnsavedFormChanges(form, baseline) {
  if (!form || !Array.isArray(baseline)) return false;
  const current = snapshotFormValues(form);
  return current !== null && JSON.stringify(current) !== JSON.stringify(baseline);
}

/** Used when multiple simultaneously visible quick-list forms can be edited. */
export function hasOtherUnsavedForms(forms, baselines, exceptId = '') {
  if (!baselines || typeof baselines !== 'object') return false;
  return Object.entries(baselines).some(([id, baseline]) => id !== exceptId &&
    hasUnsavedFormChanges(forms[id], baseline));
}
