/* Standalone, uninstalled monitor. Requires Advanced Drive service v3.
 * Never log credentials, signed status bodies, filenames or accounting data.
 * The status writer must publish only after successful encrypted upload and
 * download verification; this does not certify recovery or authenticate GitHub.
 */
const STATUS_NAME = 'azzora-backup-status-v1.json';
const APPROVED_RECIPIENT = 'fazil4fazi@gmail.com';
const STATUS_FIELDS = ['archiveBytes','archiveFileId','archiveMd5','archiveSha256','capturedAt','complete','completedAt','dataDump','format','objectCount','projectRef','rolesDump','runId','schemaDump'];

function canonicalStatus(payload) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object' ||
      JSON.stringify(Object.keys(payload).sort()) !== JSON.stringify(STATUS_FIELDS)) throw Error('invalid_manifest');
  const result = {};
  STATUS_FIELDS.forEach(function(k) { result[k] = payload[k]; });
  return JSON.stringify(result);
}
function hexBytes(bytes) { return bytes.map(function(b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function statusHmac(payload, key) {
  return hexBytes(Utilities.computeHmacSha256Signature(Utilities.newBlob(canonicalStatus(payload)).getBytes(), key));
}
function fixedEqual(a,b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff=0; for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i); return diff===0;
}
function checkStatus(wrapper, archive, config, now) {
  if (!wrapper || !wrapper.payload || !/^[0-9a-f]{64}$/.test(wrapper.mac || '')) throw Error('invalid_manifest');
  const p=wrapper.payload;
  const expected=statusHmac(p, config.key);
  if (!fixedEqual(wrapper.mac, expected)) throw Error('invalid_manifest_signature');
  const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
  if (p.format !== 'azzora-backup-status-v1' || p.projectRef !== config.projectRef ||
      p.complete !== true || p.schemaDump !== true || p.dataDump !== true || p.rolesDump !== true ||
      !Number.isSafeInteger(p.archiveBytes) || p.archiveBytes <= 0 || !Number.isSafeInteger(p.objectCount) || p.objectCount < 0 ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(p.runId || '') || !/^[A-Za-z0-9_-]{1,200}$/.test(p.archiveFileId || '') ||
      !/^[0-9a-f]{64}$/.test(p.archiveSha256 || '') || !/^[0-9a-f]{32}$/.test(p.archiveMd5 || '') ||
      !iso.test(p.capturedAt || '') || !iso.test(p.completedAt || '')) throw Error('invalid_manifest');
  const captured=Date.parse(p.capturedAt), completed=Date.parse(p.completedAt);
  if (!Number.isFinite(captured) || !Number.isFinite(completed) || captured>completed || completed>now || now-captured>config.maxAgeMs) throw Error('stale_or_invalid_backup');
  if (!archive || archive.id!==p.archiveFileId || archive.trashed || archive.shared !== false ||
      !Array.isArray(archive.parents) || archive.parents.length!==1 || archive.parents[0]!==config.folderId ||
      !Array.isArray(archive.owners) || archive.owners.length!==1 || archive.owners[0].emailAddress!==config.owner ||
      String(archive.size)!==String(p.archiveBytes) || archive.md5Checksum!==p.archiveMd5) throw Error('archive_incomplete_or_inaccessible');
  return {capturedAt:p.capturedAt, completedAt:p.completedAt, runId:p.runId};
}
function monitorBackup() {
  const props=PropertiesService.getScriptProperties();
  const owner=props.getProperty('OWNER_EMAIL'), recipient=props.getProperty('ALERT_EMAIL'), folderId=props.getProperty('FOLDER_ID');
  const projectRef=props.getProperty('PROJECT_REF'), maxAgeHours=Number(props.getProperty('MAX_BACKUP_AGE_HOURS'));
  // Do not send any mail if recipient configuration has been changed.
  if (owner!==APPROVED_RECIPIENT || recipient!==APPROVED_RECIPIENT) throw Error('monitor_recipient_not_authorized');
  let problems=[];
  try {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(folderId || '') || !/^[a-z0-9]{20}$/.test(projectRef || '') || !Number.isFinite(maxAgeHours) || maxAgeHours<=0 || maxAgeHours>168) throw Error('monitor_not_configured');
    const key=Utilities.base64DecodeWebSafe(props.getProperty('MONITOR_HMAC_KEY') || '');
    if (key.length!==32) throw Error('monitor_not_configured');
    const quota=Drive.About.get({fields:'storageQuota'}).storageQuota;
    const used=Number(quota.usage), limit=Number(quota.limit);
    if (!Number.isFinite(used)||!Number.isFinite(limit)||limit<=0) throw Error('storage_quota_unavailable');
    if (used/limit>=0.85) problems.push('Drive storage is at least 85% full.');
    const folder=Drive.Files.get(folderId,{fields:'id,mimeType,owners(emailAddress),shared,trashed'});
    if (folder.trashed || folder.mimeType!=='application/vnd.google-apps.folder' || folder.shared!==false || !folder.owners || folder.owners.length!==1 || folder.owners[0].emailAddress!==owner) throw Error('folder_access_or_privacy');
    const q="'" + folderId.replace(/'/g, "\\'") + "' in parents and trashed = false and name = '" + STATUS_NAME + "'";
    const list=Drive.Files.list({q:q,fields:'nextPageToken,files(id,size,owners(emailAddress),shared,parents,trashed)',pageSize:3});
    if (list.nextPageToken || !list.files || list.files.length!==1) throw Error('missing_or_duplicate_status');
    const marker=list.files[0];
    if (!Number.isSafeInteger(Number(marker.size)) || Number(marker.size)<=0 || Number(marker.size)>65536 || marker.shared!==false || !marker.owners || marker.owners.length!==1 || marker.owners[0].emailAddress!==owner || !marker.parents || marker.parents.length!==1 || marker.parents[0]!==folderId) throw Error('invalid_status_file');
    let wrapper; try { wrapper=JSON.parse(DriveApp.getFileById(marker.id).getBlob().getDataAsString('UTF-8')); } catch (_) { throw Error('invalid_status_file'); }
    if (!wrapper || !wrapper.payload || !/^[0-9a-f]{64}$/.test(wrapper.mac || '') ||
        !fixedEqual(wrapper.mac,statusHmac(wrapper.payload,key))) throw Error('invalid_manifest_signature');
    const id=wrapper.payload.archiveFileId;
    if (typeof id!=='string' || !/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw Error('invalid_manifest');
    const archive=Drive.Files.get(id,{fields:'id,size,md5Checksum,owners(emailAddress),parents,shared,trashed'});
    checkStatus(wrapper,archive,{key:key,owner:owner,folderId:folderId,projectRef:projectRef,maxAgeMs:maxAgeHours*3600000},Date.now());
  } catch (error) {
    // Do not disclose provider errors, headers, secrets, object contents, or IDs.
    problems.push('Backup check failed or could not authenticate. Inspect the independent monitor and backup job.');
  }
  if (problems.length) {
    if (!recipient || MailApp.getRemainingDailyQuota()<1) throw Error('alert_delivery_unavailable');
    MailApp.sendEmail(recipient,'AZZORA Accounts backup warning',problems.join('\n')+'\n\nThis alert does not prove that a backup can be restored.');
    return {ok:false};
  }
  return {ok:true};
}
function sendTestAlert() {
  const props=PropertiesService.getScriptProperties();
  const recipient=props.getProperty('ALERT_EMAIL');
  if (recipient!==APPROVED_RECIPIENT || props.getProperty('OWNER_EMAIL')!==APPROVED_RECIPIENT) throw Error('monitor_recipient_not_authorized');
  if (MailApp.getRemainingDailyQuota()<1) throw Error('alert_delivery_unavailable');
  MailApp.sendEmail(recipient,'AZZORA backup monitor test','This is a test alert. Automatic backup and restore readiness must be verified separately.');
}
