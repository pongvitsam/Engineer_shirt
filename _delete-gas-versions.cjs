const fs = require('fs');
const SCRIPT_ID = '1X9SPQXcEdaYk9qkyIy7eHDCFq2cCtPbXo_Ng-Fcfk78liJFvmwz7AL2Q';
const rc = JSON.parse(fs.readFileSync('C:/Users/User/.clasprc.json', 'utf8'));

async function getAccessToken() {
  const t = rc.token;
  if (t.expiry_date && Date.now() < t.expiry_date - 60000) return t.access_token;
  const body = new URLSearchParams({
    client_id: rc.oauth2ClientSettings.clientId,
    client_secret: rc.oauth2ClientSettings.clientSecret,
    refresh_token: t.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  if (!res.ok) throw new Error('token refresh failed: ' + (await res.text()));
  const data = await res.json();
  t.access_token = data.access_token;
  t.expiry_date = Date.now() + (data.expires_in || 3600) * 1000;
  return t.access_token;
}

const DEPLOY_KEEP = new Set([112, 119, 120, 146, 187, 188, 189, 190, 191, 193, 195, 200]);
function shouldKeep(n) {
  if (n >= 175 && n <= 200) return true;
  if (DEPLOY_KEEP.has(n)) return true;
  return false;
}

async function listVersions(token) {
  const versions = [];
  let pageToken;
  do {
    const url = new URL(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/versions`);
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error('list failed: ' + (await res.text()));
    const data = await res.json();
    if (data.versions) versions.push(...data.versions);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return versions;
}

async function deleteVersion(token, versionNumber) {
  const url = `https://script.googleapis.com/v1/projects/${SCRIPT_ID}/versions/${versionNumber}`;
  const res = await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, versionNumber, text };
  }
  return { ok: true, versionNumber };
}

(async () => {
  const token = await getAccessToken();
  const versions = await listVersions(token);
  const nums = versions.map(v => Number(v.versionNumber)).sort((a, b) => a - b);
  const toDelete = nums.filter(n => !shouldKeep(n));
  console.log('Total versions:', nums.length);
  console.log('Keeping:', nums.filter(shouldKeep).length, [...nums.filter(shouldKeep)].join(','));
  console.log('To delete:', toDelete.length);
  let deleted = 0;
  const failures = [];
  for (const n of toDelete) {
    let tok = await getAccessToken();
    const r = await deleteVersion(tok, n);
    if (r.ok) {
      deleted++;
      if (deleted % 20 === 0) console.log('deleted', deleted);
    } else {
      failures.push(r);
      console.error('fail', n, r.text.slice(0, 200));
    }
    await new Promise(r => setTimeout(r, 150));
  }
  const after = await listVersions(token);
  console.log('Deleted count:', deleted);
  console.log('Remaining:', after.length);
  if (failures.length) console.log('Failures:', failures.length);
})();
