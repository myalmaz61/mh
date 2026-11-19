export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
}
export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
}
export function humanDate(date, language) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'bg-BG', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(date);
}
export function safeClone(value) { return JSON.parse(JSON.stringify(value)); }
export function makeNote(kind) {
  const timestamp = new Date().toISOString();
  return { id:uid(), kind, title:'', body:'', items:[], pinned:false, favourite:false, createdAt:timestamp, updatedAt:timestamp };
}
export function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
