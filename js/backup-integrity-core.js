/**
 * v5.0 — optional SHA-256 integrity for personal JSON backups.
 * Unkeyed SHA-256 detects accidental file corruption after export. It is NOT
 * encryption, a digital signature or proof of who created the backup.
 * Canonical ordering makes the hash independent of JSON indentation/key order.
 * Legacy format:1 backups without an integrity field stay importable.
 */
export const BACKUP_HASH_ALGORITHM = 'SHA-256';

function normaliseJson(value) {
  if (Array.isArray(value)) return value.map(normaliseJson);
  if (value !== null && typeof value === 'object') {
    const sorted = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      // JSON.stringify omits undefined values on objects, just as JSON files do.
      if (value[key] !== undefined) sorted[key] = normaliseJson(value[key]);
    }
    return sorted;
  }
  return value;
}
export function canonicalBackupJson(archive) {
  if (!archive || typeof archive !== 'object' || Array.isArray(archive)) throw Error('Invalid backup envelope');
  const { integrity: _withoutIntegrity, ...body } = archive;
  return JSON.stringify(normaliseJson(body));
}
async function digestBackup(archive, cryptoProvider) {
  if (!cryptoProvider?.subtle?.digest) {
    const error = Error('SHA-256 is unavailable. Open MyHub over HTTPS in Chrome.');
    error.code = 'hash-unavailable';
    throw error;
  }
  const bytes = new TextEncoder().encode(canonicalBackupJson(archive));
  const digest = await cryptoProvider.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte=>byte.toString(16).padStart(2,'0')).join('');
}
/** Returns a new archive; never mutates the original validated backup. */
export async function sealBackupArchive(archive, cryptoProvider=globalThis.crypto) {
  if (!archive || archive.app!=='MyHub' || archive.format!==1 || !archive.data) throw Error('Invalid MyHub backup');
  const body = {...archive};
  delete body.integrity;
  const sha256=await digestBackup(body,cryptoProvider);
  return {...body,integrity:{algorithm:BACKUP_HASH_ALGORITHM,sha256}};
}
/** Verify before showing a Restore preview AND again before any writes. */
export async function verifyBackupArchive(archive, cryptoProvider=globalThis.crypto) {
  if (!archive || typeof archive !== 'object' || Array.isArray(archive)) throw Error('Invalid backup envelope');
  if (!Object.hasOwn(archive,'integrity')) return {status:'legacy'};
  const marker=archive.integrity;
  if (!marker || typeof marker!=='object' || Array.isArray(marker) ||
      marker.algorithm!==BACKUP_HASH_ALGORITHM ||
      typeof marker.sha256!=='string' || !/^[0-9a-f]{64}$/.test(marker.sha256) ||
      Object.keys(marker).length!==2) {
    const error=Error('Invalid backup integrity metadata');error.code='invalid-integrity';throw error;
  }
  const actual=await digestBackup(archive,cryptoProvider);
  if (actual!==marker.sha256) {
    const error=Error('Backup checksum mismatch — file contents changed or are damaged');
    error.code='integrity-mismatch';throw error;
  }
  return {status:'verified'};
}
