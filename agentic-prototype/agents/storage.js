// Persist A+ - JSON file DB dengan katalog Poody + sales/expenses/wastes
// Lokal: file ./data/db.json | Vercel: Vercel Blob private (poody/db.json + poody/users.json) + /tmp cache (blocking hydrate)
const fs = require('fs');
const path = require('path');
const isVercel = !!process.env.VERCEL;
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const dataDir = isVercel ? path.join('/tmp', 'poody-data') : path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');
const usersPath = path.join(dataDir, 'users.json');

const BLOB_DB = 'poody/db.json';
const BLOB_USERS = 'poody/users.json';

const POODY_CATALOG = {
  business: { id: 'biz_poody', name: 'Poody', type: 'F&B Dessert', avg_daily_revenue: 200000 },
  variants: ['chocolatte','matcha','mango','strawberry','taro','bubblemgum'],
  sizes: {
    M: { label: 'Size M', hpp: 5100, price: 10000, profit: 4900 },
    L: { label: 'Size L', hpp: 6100, price: 12000, profit: 5900 }
  },
  toppings: {
    'keju': { label: 'Keju', price: 2000, hpp: 900, profit: 1100 },
    'oreo crumb': { label: 'Oreo Crumb', price: 2000, hpp: 900, profit: 1100 },
    'red velvet crumb': { label: 'Red Velvet Crumb', price: 3000, hpp: 1300, profit: 1700 },
    'matcha crumb': { label: 'Matcha Crumb', price: 3000, hpp: 1300, profit: 1700 },
    'regal crumb': { label: 'Regal Crumb', price: 3000, hpp: 1200, profit: 1800 },
    'froot loops': { label: 'Froot Loops', price: 3000, hpp: 1400, profit: 1600 },
    'koko krunch': { label: 'Koko Krunch', price: 3000, hpp: 1400, profit: 1600 }
  }
};

// ---- Blob helpers ----
let blobReady = false;
let blobHydratePromise = null;

async function blobGet(pathname) {
  try {
    const { list } = require('@vercel/blob');
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return null;
    const res = await list({ prefix: pathname });
    const blob = (res.blobs || []).find(b => b.pathname === pathname);
    if (!blob) return null;
    const r = await fetch(blob.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    console.warn('[blob] get', pathname, e.message);
    return null;
  }
}

async function blobPut(pathname, text) {
  try {
    const { put } = require('@vercel/blob');
    await put(pathname, text, {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 0,
    });
    return true;
  } catch (e) {
    console.warn('[blob] put', pathname, e.message);
    return false;
  }
}

async function hydrateFromBlob() {
  if (!isVercel || !hasBlob) return;
  if (blobReady) return;
  if (blobHydratePromise) return blobHydratePromise;
  blobHydratePromise = (async () => {
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const dbText = await blobGet(BLOB_DB);
      if (dbText) {
        try { JSON.parse(dbText); fs.writeFileSync(dbPath, dbText); console.log('[blob] hydrated db.json', dbText.length); } catch {}
      }
      const usersText = await blobGet(BLOB_USERS);
      if (usersText) {
        try { JSON.parse(usersText); fs.writeFileSync(usersPath, usersText); console.log('[blob] hydrated users.json'); } catch {}
      }
      blobReady = true;
    } catch (e) { console.warn('[blob] hydrate err', e.message); }
    finally { blobHydratePromise = null; }
  })();
  return blobHydratePromise;
}

async function ensureHydrated() {
  if (!isVercel || !hasBlob) return;
  if (blobReady) return;
  return hydrateFromBlob();
}

function ensure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (isVercel && !fs.existsSync(dbPath)) {
    try {
      const seed = path.join(__dirname, '..', 'data', 'db.json');
      if (fs.existsSync(seed)) fs.copyFileSync(seed, dbPath);
    } catch {}
  }
  if (isVercel && !fs.existsSync(usersPath)) {
    try {
      const seedU = path.join(__dirname, '..', 'data', 'users.json');
      if (fs.existsSync(seedU)) fs.copyFileSync(seedU, usersPath);
    } catch {}
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({
      businesses: [POODY_CATALOG.business],
      catalog: POODY_CATALOG,
      workflows: [], tasks: [], memories: [], metrics: [],
      sales: [], expenses: [], wastes: [], stocks: []
    }, null, 2));
  } else {
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      let changed=false;
      if (!db.catalog) { db.catalog = POODY_CATALOG; changed=true; }
      else {
        if (!db.catalog.toppings) { db.catalog.toppings = POODY_CATALOG.toppings; changed=true; }
        if (!db.businesses || !db.businesses.find(b=>b.id==='biz_poody')) { db.businesses = db.businesses||[]; db.businesses.push(POODY_CATALOG.business); changed=true; }
      }
      if (!db.sales) { db.sales=[]; changed=true; }
      if (!db.expenses) { db.expenses=[]; changed=true; }
      if (!db.wastes) { db.wastes=[]; changed=true; }
      if (!db.stocks) { db.stocks=[]; changed=true; }
      if (db.catalog && db.catalog.toppings) {
        for (const k of Object.keys(POODY_CATALOG.toppings)) {
          if (!db.catalog.toppings[k]) { db.catalog.toppings[k]=POODY_CATALOG.toppings[k]; changed=true; }
        }
      } else { db.catalog.toppings = POODY_CATALOG.toppings; changed=true; }
      if (changed) fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    } catch {}
  }
  if (!fs.existsSync(usersPath)) fs.writeFileSync(usersPath, JSON.stringify([], null, 2));
  if (isVercel && hasBlob) { hydrateFromBlob().catch(()=>{}); }
}
ensure();

function loadDB() {
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
  catch { return { businesses:[POODY_CATALOG.business], catalog:POODY_CATALOG, workflows:[], tasks:[], memories:[], metrics:[], sales:[], expenses:[], wastes:[], stocks:[] }; }
}
async function saveDB(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  if (isVercel && hasBlob) {
    const text = JSON.stringify(db, null, 2);
    const ok = await blobPut(BLOB_DB, text);
    if (ok) console.log('[blob] saved db.json', text.length);
    else console.warn('[blob] save db.json failed');
  }
}
function saveDBSync(db){ fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }
function loadUsers() { try { return JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch { return []; } }
async function saveUsers(u) {
  fs.writeFileSync(usersPath, JSON.stringify(u, null, 2));
  if (isVercel && hasBlob) {
    const text = JSON.stringify(u, null, 2);
    const ok = await blobPut(BLOB_USERS, text);
    if (ok) console.log('[blob] saved users.json');
  }
}

module.exports = { loadDB, saveDB, saveDBSync, loadUsers, saveUsers, dbPath, usersPath, POODY_CATALOG, hydrateFromBlob, ensureHydrated, blobGet, blobPut };
