// Serves the site and creates Square payments. No dependencies (Node 18+).
// Env: SQUARE_ACCESS_TOKEN, SQUARE_APP_ID, SQUARE_LOCATION_ID, SQUARE_ENV (sandbox|production), PORT
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Minimal .env loader; real environment variables take precedence.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}

const {
  SQUARE_ACCESS_TOKEN,
  SQUARE_APP_ID,
  SQUARE_LOCATION_ID,
  SQUARE_ENV = 'sandbox',
  FORMSPREE_FORM_ID,
  PORT = 3000,
} = process.env;

const isProd = SQUARE_ENV === 'production';
const SQUARE_API = isProd ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
const SDK_URL = isProd ? 'https://web.squarecdn.com/v1/square.js' : 'https://sandbox.web.squarecdn.com/v1/square.js';

// Prices in cents, keyed by menu id. Keep in sync with index.html.
const PRICES = {
  1: 300, 2: 450, 3: 500, 7: 475, 8: 350, 9: 425, 10: 550, 11: 400, 12: 475, 13: 600,
  4: 600, 5: 550, 6: 625, 14: 700, 15: 350, 16: 450, 17: 850, 18: 750, 19: 800, 20: 575, 21: 725, 22: 650,
};

const TYPES = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const ROOT = __dirname;

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 10000) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handlePay(req, res) {
  if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
    return sendJson(res, 500, { error: 'Square is not configured on the server.' });
  }
  let payload;
  try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { error: 'Invalid JSON.' }); }

  const { sourceId, items } = payload;
  if (typeof sourceId !== 'string' || !Array.isArray(items) || items.length === 0) {
    return sendJson(res, 400, { error: 'Invalid order.' });
  }

  // Total is computed server-side so the client can't tamper with prices.
  let amount = 0;
  for (const { id, qty } of items) {
    if (!(id in PRICES) || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return sendJson(res, 400, { error: 'Invalid item in order.' });
    }
    amount += PRICES[id] * qty;
  }

  try {
    const response = await fetch(`${SQUARE_API}/v2/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SQUARE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'Square-Version': '2024-10-17',
      },
      body: JSON.stringify({
        source_id: sourceId,
        idempotency_key: crypto.randomUUID(),
        location_id: SQUARE_LOCATION_ID,
        amount_money: { amount, currency: 'USD' },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      const msg = data.errors?.[0]?.detail || 'Payment failed.';
      return sendJson(res, response.status, { error: msg });
    }
    sendJson(res, 200, { id: data.payment.id, status: data.payment.status, receiptUrl: data.payment.receipt_url, amount });
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: 'Could not reach Square.' });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  const allowed = file === path.join(ROOT, 'index.html') || file.startsWith(path.join(ROOT, 'img') + path.sep);
  if (!allowed) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (req.method === 'GET' && pathname === '/api/config') {
    return sendJson(res, 200, { appId: SQUARE_APP_ID, locationId: SQUARE_LOCATION_ID, sdkUrl: SDK_URL, formspreeId: FORMSPREE_FORM_ID });
  }
  if (req.method === 'POST' && pathname === '/api/pay') return handlePay(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log(`Milano Café on http://localhost:${PORT} (Square ${SQUARE_ENV})`));
