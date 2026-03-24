import https from 'node:https';
import crypto from 'node:crypto';

function send(res, status, payload) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).send(JSON.stringify(payload));
}

function md5Upper(password) {
  return crypto.createHash('md5').update(String(password || '')).digest('hex').toUpperCase();
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET') return send(res, 200, { ok: false, error: 'method_not_allowed' });
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const username = String(body.username ?? body.u ?? '').trim();
    const password = String(body.password ?? '').trim();
    const pmd5Raw = String(body.pmd5 ?? '').trim();
    const pmd5 = pmd5Raw ? pmd5Raw.toUpperCase() : md5Upper(password);

    if (!username || !pmd5) return send(res, 200, { ok: false, error: 'id_empty' });

    const formBody = new URLSearchParams({ u: username, p: pmd5 }).toString();

    const upstreamText = await new Promise((resolve, reject) => {
      const req2 = https.request('https://violetbot.net:6963/check/', {
        method: 'POST',
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(formBody),
        },
      }, (res2) => {
        let data = '';
        res2.on('data', (chunk) => { data += chunk.toString(); });
        res2.on('end', () => resolve(data.trim()));
      });
      req2.on('error', reject);
      req2.write(formBody);
      req2.end();
    });

    const text = String(upstreamText || '').trim();
    if (text === 'wrong_creds' || text === 'id_empty') return send(res, 401, { ok: false, error: 'wrong_creds' });
    const isNumericId = /^\d+$/.test(text);
    const isHexToken = /^[0-9a-fA-F]{32}$/.test(text);
    if (text === 'unknown_err' || (!isNumericId && !isHexToken)) return send(res, 500, { ok: false, error: 'unknown_err', raw: text || null });
    return send(res, 200, { ok: true, id: isHexToken ? text.toLowerCase() : text, bdoid: isHexToken ? text.toLowerCase() : text });
  } catch (error) {
    return send(res, 500, { ok: false, error: 'proxy_failed', details: String(error && error.message ? error.message : error) });
  }
}
