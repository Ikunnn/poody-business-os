// B4 Sheets importer — fetch xlsx public, parse JUL-26 / AGUST-26 / SEP-26 / OKT-26
const { loadDB, saveDB } = require('./storage');

let XLSX;
try { XLSX = require('xlsx'); } catch { XLSX = null; }

function exToISO(n){
  if(typeof n !== 'number' || isNaN(n)) return null;
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return d.toISOString().slice(0,10);
}
function num(v){
  if(typeof v === 'number') return v;
  if(typeof v === 'string'){
    const s=v.trim(); if(!s) return 0;
    // keep minus?
    const n=parseInt(s.replace(/[^0-9-]/g,''),10);
    return isNaN(n)?0:n;
  }
  return 0;
}
function catFor(title){
  const up=(title||'').toString().toUpperCase();
  if(up.includes('MAIN') || up.includes('PISAHIN')) return 'pribadi';
  if(up.includes('PUDDING')||up.includes('EVAPORASI')||up.includes('CREAMER')||up.includes('ES KRIM')||up.includes('ICE CREAM')||up.includes('GULA')||up.includes('KEJU')||up.includes('OREO')||up.includes('FROOT')||up.includes('KOKO')||up.includes('PAPER')||up.includes('PAPPER')||up.includes('KRESEK')||up.includes('SENDOK')||up.includes('TOPPING')||up.includes('LIQUID')||up.includes('SKM')||up.includes('ES BATU')) return 'bahan';
  if(up.includes('LAPAK')||up.includes('SEWA')||up.includes('TITIP')) return 'sewa';
  if(up.includes('PARKIR')||up.includes('BENSIN')||up.includes('DISHUB')) return 'transport';
  if(up.includes('LISTRIK')) return 'utilitas';
  return 'operasional';
}

async function fetchXlsxBuffer(spreadsheetId){
  // public export
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  const r = await fetch(url, { redirect:'follow' });
  if(!r.ok) throw new Error(`fetch xlsx failed ${r.status} ${r.statusText}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

function parseSheet(wb, name){
  const ws = wb.Sheets[name];
  if(!ws) return { rev:{}, exp:{}, awal:[], empty:true };
  const rows = XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false});
  // Detect structure: JUL-26 has cols: NO,TANGGAL,KET,SATUAN,PEMASUKAN,PENGELUARAN,SALDO + right side PENGELUARAN AWAL or PENDAPATAN
  // AGUST-26 has cols: NO,TANGGAL,KETERANGAN,PEMASUKAN,PENGELUARAN,SALDO + right PENDAPATAN
  // For simplicity, use left ledger: col1=TANGGAL (index1), col2=KET(2), col4=PEMASUKAN, col5=PENGELUARAN (JUL: col4 pemasukan is index4, col5 index5; AGUST: col3 pemasukan index3, col4 index4)
  // We normalize by header row detection
  let pemasukanIdx=4, pengeluaranIdx=5, ketIdx=2, tanggalIdx=1;
  const header = rows[2]||[];
  const headerStr = header.join('|').toUpperCase();
  if(headerStr.includes('KETERANGAN') && !headerStr.includes('SATUAN')){
    // AGUST-26 : NO,TANGGAL,KETERANGAN,PEMASUKAN,PENGELUARAN,SALDO
    pemasukanIdx=3; pengeluaranIdx=4; ketIdx=2; tanggalIdx=1;
  } else {
    // JUL-26 : NO,TANGGAL,KETERANGAN,SATUAN,PEMASUKAN,PENGELUARAN,SALDO
    pemasukanIdx=4; pengeluaranIdx=5; ketIdx=2; tanggalIdx=1;
  }
  let expectedPrefix=null;
  if(name==='JUL-26') expectedPrefix='2026-07';
  // AGUST/SEP tidak pakai strict filter — 09-08 nyasar di AGUST tetap dihitung
  let cur=null;
  const rev={}; // date -> total rev
  const exp={}; // date -> [[title, amt],...]
  const awal=[]; // for JUL only, right side PENGELUARAN AWAL rows 3-10
  for(let i=3;i<rows.length;i++){
    const r=rows[i];
    const c1=r[tanggalIdx];
    const cKet=(r[ketIdx]||'').toString().trim();
    const cMasuk=r[pemasukanIdx];
    const cKeluar=r[pengeluaranIdx];
    // right side for JUL awal: cols 9-11
    if(name==='JUL-26' && i>=3 && i<=10){
      const c9=(r[9]||'').toString().trim();
      const c11=r[11];
      const a11=num(c11);
      if(c9 && !['TOTAL','PENDAPATAN',''].includes(c9.toUpperCase()) && a11>0){
        // avoid header
        if(!['LISTRIK','AZZUMAR','TOPPING','ICE CREAM','STANDING BANNER','PAPPER BOWL','ICE PACK'].includes(c9.toUpperCase()) || true){
          // push as awal if not duplicate TOTAL
          if(c9.toUpperCase()!=='TOTAL') awal.push([c9, a11]);
        }
      }
      // detect TOTAL row to capture but not treat as awal? already handled
    }
    // date detect
    if(typeof c1==='number' && c1>40000){
      cur=exToISO(c1);
      // fix: 09-08 nyasar di tab AGUST-26 itu sebenarnya 09 Agustus (524k)
      if(name==='AGUST-26' && cur==='2026-09-08') cur='2026-08-09';
      else if(name==='AGUST-26' && cur && cur.startsWith('2026-09-')) {
        // fallback: any Sep date in AGUST tab -> map to Aug same day
        cur='2026-08-'+cur.slice(8);
      }
    } else if(typeof c1==='string' && /^\d{4}-\d{2}-\d{2}$/.test(c1)){
      let tmp=c1;
      if(name==='AGUST-26' && tmp==='2026-09-08') tmp='2026-08-09';
      else if(name==='AGUST-26' && tmp.startsWith('2026-09-')) tmp='2026-08-'+tmp.slice(8);
      cur=tmp;
    } else if(typeof c1==='string' && c1.trim()){
      // sometimes date as string like 01/08/26? but xlsx gives number, rare
      const m=c1.trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if(m){
        let dd=parseInt(m[1],10), mm=parseInt(m[2],10), yy=parseInt(m[3],10);
        if(yy<100) yy+=2000;
        if(mm>12 && dd<=12) [dd,mm]=[mm,dd];
        cur=`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
      }
    }
    const aMasuk=num(cMasuk), aKeluar=num(cKeluar);
    const upKet=(cKet||'').toString().toUpperCase();
    // skip SALDO/LABA/TOTAL — jangan kehitung omset (LABA 978615 itu balance, bukan omset harian)
    // SALDO BULAN AGUSTUS 828266 di SEP-26 juga bukan omset
    const isSaldo = upKet.includes('SALDO');
    const isLaba = upKet.includes('LABA');
    const isTotal = upKet.includes('TOTAL');
    if(isSaldo || isLaba || isTotal){
      continue;
    }
    // skip TOTAL summary legacy (angka total bulanan)
    if(aMasuk===4987000 && aKeluar===4077161) continue;
    if(aMasuk===9044015 || aKeluar===8369388) continue;
    // skip rows with no cur
    if(!cur) continue;
    // NOTE: tanggal 2026-09-08 yang nyasar di tab AGUST-26 tetap dihitung sebagai omset
    // (jangan filter strict bulan), hanya SALDO/LABA/TOTAL yang di-skip
    // jadi month filter dimatikan — biar 09-08 masuk
    // skip AWAL header date cur? cur should be defined; but awal rows have cur as July dates, they still have pemasukan cols? We already captured awal, but also need to ensure we don't double count TOTAL
    if(aMasuk>0){
      rev[cur]=(rev[cur]||0)+aMasuk;
    }
    if(aKeluar>0){
      if(!exp[cur]) exp[cur]=[];
      exp[cur].push([cKet||'(tanpa ket)', aKeluar]);
    }
  }
  // Filter out TOTAL string in awal (should not)
  const awalFiltered=awal.filter(([k])=> k.toUpperCase()!=='TOTAL');
  // Deduplicate awal by keeping first
  return { rev, exp, awal: awalFiltered, rowsCount: rows.length };
}

function parseHPP(wb){
  const ws=wb.Sheets['HPP'];
  if(!ws) return null;
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false});
  const toNum=v=> num(v);
  const perCup={ L:[], M:[] };
  for(let i=2;i<=9;i++){
    const r=rows[i]||[];
    const lItem=(r[0]||'').toString().trim(), lSat=(r[1]||'').toString().trim(), lHarga=toNum(r[2]), lPakai=toNum(r[3]), lHpp=toNum(r[4]);
    if(lItem) perCup.L.push({item:lItem,satuan:lSat,harga:lHarga,terpakai:lPakai,hpp:lHpp|| (lHarga&&lPakai? Math.round(lHarga/lPakai):0)});
    const mItem=(r[6]||'').toString().trim(), mSat=(r[7]||'').toString().trim(), mHarga=toNum(r[8]), mPakai=toNum(r[9]), mHpp=toNum(r[10]);
    if(mItem) perCup.M.push({item:mItem,satuan:mSat,harga:mHarga,terpakai:mPakai,hpp:mHpp|| (mHarga&&mPakai? Math.round(mHarga/mPakai):0)});
  }
  const monthly=[];
  for(let i=14;i<=30;i++){
    const r=rows[i]||[];
    const item=(r[3]||'').toString().trim();
    if(!item) continue;
    const satuan=(r[4]||'').toString().trim();
    const harga=toNum(r[5]), pakai=toNum(r[6]), total=toNum(r[7]) || (harga&&pakai? harga*pakai:0);
    if(item.toUpperCase()==='TOTAL' || !harga) {
      if(item.toUpperCase()==='TOTAL') continue;
      // allow RED VELVET 0 harga still push
      if(!item) continue;
    }
    monthly.push({item,satuan,harga,terpakai:pakai,total});
  }
  const totalMonthly=monthly.reduce((a,b)=>a+(b.total||0),0);
  const hppL = perCup.L.reduce((a,b)=>a+(b.hpp||0),0);
  const hppM = perCup.M.reduce((a,b)=>a+(b.hpp||0),0);
  return {perCup, hppL, hppM, monthly, totalMonthly, hargaJual:{L:12000,M:10000}};
}

async function syncSheets({ spreadsheetId, businessId='biz_poody' }){
  if(!XLSX) throw new Error('xlsx not installed');
  if(!spreadsheetId) throw new Error('spreadsheetId required');
  const buf = await fetchXlsxBuffer(spreadsheetId);
  const wb2 = XLSX.read(buf, { type:'buffer' });
  const names = wb2.SheetNames;
  const hpp=parseHPP(wb2);
  // Parse JUL-26 and AGUST-26 etc
  const jul = names.includes('JUL-26') ? parseSheet(wb2,'JUL-26') : { rev:{}, exp:{}, awal:[] };
  const agust = names.includes('AGUST-26') ? parseSheet(wb2,'AGUST-26') : { rev:{}, exp:{}, awal:[] };
  const sep = names.includes('SEP-26') ? parseSheet(wb2,'SEP-26') : { rev:{}, exp:{}, awal:[] };
  const okt = names.includes('OKT-26') ? parseSheet(wb2,'OKT-26') : { rev:{}, exp:{}, awal:[] };

  const db = loadDB();
  // Remove previous sheet imports for this business (keep non-sheet)
  const keepSales = (db.sales||[]).filter(s=> s.source!=='sheet' || s.business_id!==businessId);
  const keepExp = (db.expenses||[]).filter(e=> e.source!=='sheet' || e.business_id!==businessId);
  const newSales = [...keepSales];
  const newExp = [...keepExp];

  function addMonth(revMap, expMap, sheetName){
    for(const [d, rev] of Object.entries(revMap)){
      if(rev<=0) continue;
      const cups = Math.max(1, Math.round(rev/11000));
      const unit = Math.round(rev / cups);
      newSales.push({
        id:`sheet_sale_${d.replace(/-/g,'')}_${sheetName}`,
        business_id: businessId,
        date:d,
        items:[{ variant:'import-mix', size:'M', qty:cups, price:unit, hpp:0, toppings:[], topping_price:0, topping_hpp:0, unit_price:unit, unit_hpp:0, revenue:rev, cost:0, profit:rev }],
        revenue:rev, cost:0, profit:rev, total_cups:cups,
        note:`Import ${sheetName} Google Sheet`,
        source:'sheet', created_at:`${d}T08:00:00.000Z`, created_by:'sheet_sync'
      });
    }
    for(const [d, lst] of Object.entries(expMap)){
      for(const [title, amt] of lst){
        const cat=catFor(title);
        newExp.push({
          id:`sheet_exp_${d.replace(/-/g,'')}_${Math.abs((title+amt).split('').reduce((a,c)=>a+c.charCodeAt(0),0))%100000}_${sheetName}`,
          business_id: businessId,
          date:d, title, category:cat, amount:amt,
          note:`Import ${sheetName} Google Sheet`,
          source:'sheet', created_at:`${d}T09:00:00.000Z`, created_by:'sheet_sync'
        });
      }
    }
  }
  addMonth(jul.rev, jul.exp, 'JUL-26');
  addMonth(agust.rev, agust.exp, 'AGUST-26');
  addMonth(sep.rev, sep.exp, 'SEP-26');
  addMonth(okt.rev, okt.exp, 'OKT-26');
  // awal for JUL as 2026-07-05
  for(const [title, amt] of jul.awal){
    const cat=catFor(title);
    // avoid TOTAL
    if(title.toUpperCase()==='TOTAL') continue;
    newExp.push({
      id:`sheet_exp_20260705_${Math.abs((title+amt).split('').reduce((a,c)=>a+c.charCodeAt(0),0))%100000}_AWAL`,
      business_id: businessId,
      date:'2026-07-05', title:`[AWAL] ${title}`, category:cat, amount:amt,
      note:'PENGELUARAN AWAL JULI (sheet col 9-11)',
      source:'sheet', created_at:'2026-07-05T09:00:00.000Z', created_by:'sheet_sync'
    });
  }

  // Deduplicate sales by date+sheet (if multiple same date same sheet, merge already sum rev, so one per date)
  // Ensure sorted
  newSales.sort((a,b)=> a.date.localeCompare(b.date));
  newExp.sort((a,b)=> a.date.localeCompare(b.date));

  db.sales=newSales;
  db.expenses=newExp;
  // Ensure business exists
  if(!db.businesses) db.businesses=[];
  if(!db.businesses.find(b=>b.id===businessId)){
    db.businesses.push({ id:businessId, name: businessId==='biz_poody'?'Poody Silky Pudding':businessId, type:'F&B Dessert', avg_daily_revenue:200000 });
  }
  // persist master bahan ke db.hppMaster SEBELUM save — biar ke-save bareng
  if(hpp){
    db.hppMaster=db.hppMaster||{};
    db.hppMaster[businessId]={...hpp, synced_at:new Date().toISOString(), spreadsheetId};
  }
  await saveDB(db);

  const summary={
    sheetNames:names,
    jul:{ revDays:Object.keys(jul.rev).length, revTotal:Object.values(jul.rev).reduce((a,b)=>a+b,0), expTotal:Object.values(jul.exp).flat().reduce((a,b)=>a+b[1],0), awalTotal: jul.awal.reduce((a,b)=>a+b[1],0), awal: jul.awal },
    agust:{ revDays:Object.keys(agust.rev).length, revTotal:Object.values(agust.rev).reduce((a,b)=>a+b,0), expTotal:Object.values(agust.exp).flat().reduce((a,b)=>a+b[1],0) },
    sep:{ revDays:Object.keys(sep.rev).length, revTotal:Object.values(sep.rev).reduce((a,b)=>a+b,0), expTotal:Object.values(sep.exp).flat().reduce((a,b)=>a+b[1],0) },
    okt:{ revDays:Object.keys(okt.rev).length, revTotal:Object.values(okt.rev).reduce((a,b)=>a+b,0), expTotal:Object.values(okt.exp).flat().reduce((a,b)=>a+b[1],0) },
    hpp: hpp? {hppL:hpp.hppL, hppM:hpp.hppM, monthly: hpp.monthly, totalMonthly: hpp.totalMonthly, perCup: hpp.perCup}: null,
    imported:{ sales: newSales.filter(s=>s.source==='sheet' && s.business_id===businessId).length, expenses: newExp.filter(e=>e.source==='sheet' && e.business_id===businessId).length },
    total:{ sales: newSales.length, expenses: newExp.length }
  };
  return summary;
}

module.exports={ syncSheets, parseSheet, parseHPP, catFor };
