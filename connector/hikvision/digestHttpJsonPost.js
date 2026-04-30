'use strict';

/**
 * HTTP POST with JSON body and RFC 2617 Digest auth (Hikvision ISAPI).
 * CommonJS only — works inside pkg snapshots (no ESM digest-fetch).
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

function md5(s) {
  return crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
}

function pickDigestChallenge(wwwAuthenticate) {
  if (!wwwAuthenticate) return null;
  const list = Array.isArray(wwwAuthenticate) ? wwwAuthenticate : [wwwAuthenticate];
  for (const raw of list) {
    const p = String(raw).trim();
    if (/^Digest\s+/i.test(p)) return p;
  }
  return null;
}

function parseDigestParams(digestHeader) {
  const s = digestHeader.replace(/^\s*Digest\s+/i, '').trim();
  const params = {};
  const re = /(?:^|,)\s*(\w+)=(?:"([^"]*)"|([^,]*))/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const k = m[1].toLowerCase();
    const v = m[2] != null ? m[2] : String(m[3] || '').trim();
    params[k] = v;
  }
  return params;
}

function requestOnce(options) {
  return new Promise((resolve, reject) => {
    const lib = options.protocol === 'https:' ? https : http;
    const port = Number(options.port) || (options.protocol === 'https:' ? 443 : 80);
    const req = lib.request(
      {
        hostname: options.hostname,
        port,
        path: options.path,
        method: options.method || 'POST',
        headers: options.headers || {},
        timeout: options.timeoutMs || 120000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    if (options.body != null) req.write(options.body, 'utf8');
    req.end();
  });
}

function buildDigestAuthHeader(username, password, method, uri, wwwAuthenticate) {
  const p = parseDigestParams(wwwAuthenticate);
  const realm = p.realm || '';
  const nonce = p.nonce || '';
  const qopRaw = (p.qop || 'auth').split(',')[0].trim().replace(/"/g, '');
  const qop = qopRaw || 'auth';
  const opaque = p.opaque;

  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const nc = '00000001';
  const cnonce = md5(`${Date.now()}:${Math.random()}`).slice(0, 16);
  const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const parts = [
    `Digest username="${esc(username)}"`,
    `realm="${esc(realm)}"`,
    `nonce="${esc(nonce)}"`,
    `uri="${esc(uri)}"`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
    `response="${response}"`,
    'algorithm=MD5',
  ];
  if (opaque) parts.push(`opaque="${esc(opaque)}"`);
  return parts.join(', ');
}

function toFetchLike(res) {
  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    json: async () => JSON.parse(res.body),
    text: async () => res.body,
  };
}

/**
 * POST JSON to deviceUrl with Digest auth (401 challenge then retry).
 * @param {string} deviceUrl full URL e.g. http://192.168.0.1/ISAPI/...
 * @param {string} username
 * @param {string} password
 * @param {object|string} jsonBody object or string
 */
async function digestJsonPost(deviceUrl, username, password, jsonBody) {
  const url = new URL(deviceUrl);
  const isHttps = url.protocol === 'https:';
  const bodyStr = typeof jsonBody === 'string' ? jsonBody : JSON.stringify(jsonBody);
  const pathWithQuery = url.pathname + (url.search || '');

  const base = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: pathWithQuery,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr, 'utf8'),
    },
    body: bodyStr,
    timeoutMs: 120000,
  };

  let res = await requestOnce(base);
  if (res.statusCode !== 401) {
    return toFetchLike(res);
  }

  const www = pickDigestChallenge(res.headers['www-authenticate']);
  if (!www) {
    return toFetchLike(res);
  }

  const auth = buildDigestAuthHeader(username, password, 'POST', pathWithQuery, www);
  res = await requestOnce({
    ...base,
    headers: {
      ...base.headers,
      Authorization: auth,
    },
  });
  return toFetchLike(res);
}

module.exports = { digestJsonPost };
