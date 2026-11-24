/** v6.7 — selected JSON backup verification. Pure, read-only, no Restore. */
import { validateBackup } from './db.js';
import { verifyBackupArchive } from './backup-integrity-core.js';
import { previewBackup } from './backup-preview-core.js';
export const MAX_DIAGNOSTIC_FILE_BYTES = 20_000_000;
export async function inspectBackupText(text, declaredSize, verifier=verifyBackupArchive){
  if(typeof text!=='string' || !Number.isFinite(declaredSize) || declaredSize<0 ||
     declaredSize>MAX_DIAGNOSTIC_FILE_BYTES || text.length>MAX_DIAGNOSTIC_FILE_BYTES) throw Error('Backup exceeds 20 MB or is not text');
  const archive=JSON.parse(text);
  const validated=validateBackup(archive);
  const result=await verifier(archive);
  if(!result || !['verified','legacy'].includes(result.status))throw Error('Backup integrity could not be confirmed');
  const summary=previewBackup(archive,validated);
  return {status:result.status, date:summary.createdAt, version:summary.version, notes:summary.counts.notes};
}
