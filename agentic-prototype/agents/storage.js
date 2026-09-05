// Persist A+ - JSON file DB dengan katalog Poody + sales/expenses
const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'db.json');
const usersPath = path.join(dataDir, 'users.json');

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

function ensure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({
      businesses: [POODY_CATALOG.business],
      catalog: POODY_CATALOG,
      workflows: [], tasks: [], memories: [], metrics: [],
      sales: [], expenses: []
    }, null, 2));
  } else {
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      let changed=false;
      if (!db.catalog) { db.catalog = POODY_CATALOG; changed=true; }
      else {
        // patch toppings if missing
        if (!db.catalog.toppings) { db.catalog.toppings = POODY_CATALOG.toppings; changed=true; }
        // ensure business
        if (!db.businesses || !db.businesses.find(b=>b.id==='biz_poody')) { db.businesses = db.businesses||[]; db.businesses.push(POODY_CATALOG.business); changed=true; }
      }
      if (!db.sales) { db.sales=[]; changed=true; }
      if (!db.expenses) { db.expenses=[]; changed=true; }
      // also update hpp/profit if catalog changed version
      if (db.catalog && db.catalog.toppings) {
        // ensure all 7 toppings exist
        for (const k of Object.keys(POODY_CATALOG.toppings)) {
          if (!db.catalog.toppings[k]) { db.catalog.toppings[k]=POODY_CATALOG.toppings[k]; changed=true; }
        }
      } else { db.catalog.toppings = POODY_CATALOG.toppings; changed=true; }
      if (changed) fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    } catch {}
  }
  if (!fs.existsSync(usersPath)) fs.writeFileSync(usersPath, JSON.stringify([], null, 2));
}
ensure();

function loadDB() {
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
  catch { return { businesses:[POODY_CATALOG.business], catalog:POODY_CATALOG, workflows:[], tasks:[], memories:[], metrics:[], sales:[], expenses:[] }; }
}
function saveDB(db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }
function loadUsers() { try { return JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch { return []; } }
function saveUsers(u) { fs.writeFileSync(usersPath, JSON.stringify(u, null, 2)); }

module.exports = { loadDB, saveDB, loadUsers, saveUsers, dbPath, usersPath, POODY_CATALOG };
