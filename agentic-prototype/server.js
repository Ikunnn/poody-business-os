// Prototype Server - CEO + Agents + Poody Sales/Expenses + Persist + Vision
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { callLLM, isMock, model } = require('./agents/llm');
const { loadDB, saveDB, POODY_CATALOG, ensureHydrated } = require('./agents/storage');
const { registerUser, loginUser, authMiddleware } = require('./agents/auth');
const { buildBriefing, formatBriefingText } = require('./agents/briefing');
const { buildForecast } = require('./agents/forecast');
const { syncSheets } = require('./agents/sheets');
const { buildKpiStatus } = require('./agents/kpi');
const { searchRag } = require('./agents/rag');
const XLSX = require('xlsx');

const app = express();
const PORT = parseInt(process.env.PORT || '8001', 10);
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const DEFAULT_BIZ = 'biz_poody';

// Vercel Blob: pastikan /tmp sudah hydrate dari Blob sebelum baca db (blocking first request)
app.use(async (req, res, next) => {
  if (process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN) {
    try { await ensureHydrated(); } catch(e){ console.warn('[blob] ensureHydrated', e.message); }
  }
  next();
});

app.get('/api', (req,res)=>res.json({ ok:true, service:'Agentic Prototype - Poody', mode: isMock() ? 'MOCK' : `LLM ${model()}`, port: PORT, catalog: POODY_CATALOG }));
app.get('/health', (req,res)=>res.json({ ok:true, mode: isMock()?'MOCK':'LLM', model: model(), now:new Date().toISOString() }));

// AUTH
app.post('/api/v1/auth/register', async (req,res)=>{
  try{
    const { email,password,name,role }=req.body;
    if(!email||!password) return res.status(400).json({error:'email & password required'});
    const r=await registerUser({email,password,name,role});
    res.status(201).json(r);
  }catch(e){ if(e.message==='email_exists') return res.status(409).json({error:'email_exists'}); res.status(500).json({error:e.message}); }
});
app.post('/api/v1/auth/login', async (req,res)=>{
  try{ const r=await loginUser(req.body); res.json(r); }catch(e){ res.status(401).json({error:e.message}); }
});
app.get('/api/v1/auth/me', authMiddleware, (req,res)=>res.json({user:req.user}));

// allow anon for catalog/salesExpenses/dashboard overview (UMKM quick input); protect workflows/chat

// DEBUG blob - public (no auth) for persist check
app.get('/api/v1/debug/blob', async (req,res)=>{
  const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
  const hasVercel = !!process.env.VERCEL;
  let listOk=null, blobDbSize=null, blobDbSales=null, err=null;
  try{
    if(hasBlob){
      const { list } = require('@vercel/blob');
      const l = await list({ prefix: 'poody/db.json' });
      listOk = l.blobs.map(b=>({pathname:b.pathname,size:b.size,uploadedAt:b.uploadedAt}));
      if(l.blobs.length){
        const token=process.env.BLOB_READ_WRITE_TOKEN;
        const r=await fetch(l.blobs.find(b=>b.pathname==='poody/db.json')?.url || l.blobs[0].url, { headers:{Authorization:`Bearer ${token}`}});
        const t=await r.text();
        const j=JSON.parse(t);
        blobDbSize=t.length; blobDbSales=(j.sales||[]).length;
      }
    }
  }catch(e){ err=e.message + ' ' + (e.stack||'').slice(0,600); }
  res.json({ hasBlob, hasVercel, VERCEL: process.env.VERCEL, listOk, blobDbSize, blobDbSales, err });
});
app.post('/api/v1/debug/blob/put', async (req,res)=>{
  try{
    const { saveDB, loadDB } = require('./agents/storage');
    const db=loadDB();
    const id=`dbg_${Date.now()}`;
    db.sales=db.sales||[];
    db.sales.push({id, business_id:'biz_poody', date:'2026-09-05', items:[{variant:'chocolatte',size:'M',qty:1,price:10000,hpp:5100,toppings:[],topping_price:0,topping_hpp:0,unit_price:10000,unit_hpp:5100,revenue:10000,cost:5100,profit:4900}], revenue:10000,cost:5100,profit:4900,total_cups:1, note:'debug-blob'});
    await saveDB(db);
    res.json({ok:true, id, sales:db.sales.length});
  }catch(e){ res.status(500).json({error:e.message, stack:e.stack?.slice(0,800)}); }
});

app.use('/api/v1', (req,res,next)=>{
  const p = req.path; // sudah strip /api/v1
  // briefing/forecast/kpi/rag/business/sync/workflows/tasks/memories/export terbuka tanpa login untuk UMKM
  if(p.startsWith('/debug') || p.startsWith('/briefing') || p.startsWith('/forecast') || p.startsWith('/kpi') || p.startsWith('/rag') || p.startsWith('/businesses') || p.startsWith('/sync') || p.startsWith('/workflows') || p.startsWith('/tasks') || p.startsWith('/memories') || p.startsWith('/export/') || p==='/export/excel' || p==='/export/receipt') {
    const h = req.headers.authorization;
    if(h && h.startsWith('Bearer ')){
      try{ const jwt=require('jsonwebtoken'); const sec=process.env.JWT_SECRET||'dev-secret-change-in-prod-32chars!'; req.user=jwt.verify(h.slice(7), sec);}catch{}
    }
    if(!req.user) req.user={ id:'usr_anon_poody', role:'owner' };
    return next();
  }
  const openExact = ['/catalog','/sales','/expenses','/dashboard/overview','/dashboard/summary','/dashboard/today','/dashboard','/briefing/today','/briefing/latest','/briefing/run','/briefing','/forecast/7d','/forecast/stock','/forecast/alerts','/forecast','/agents/ceo/chat','/agents/financial_analyst/chat','/agents/marketing_manager/chat','/agents/copywriter/chat','/agents/social_media/chat','/businesses','/sync/sheets','/kpi/status','/rag/search','/workflows','/tasks','/memories','/image/summarize','/image/transform'];
  const openPrefix = ['/catalog','/sales','/expenses','/dashboard','/briefing','/forecast','/agents','/businesses','/sync','/kpi','/rag','/workflows','/tasks','/memories','/image','/auth/','/debug'];
  const isOpen = openExact.includes(p) || openPrefix.some(pref => p === pref || p.startsWith(pref + '/') || p.startsWith(pref));
  if(isOpen){
    const h = req.headers.authorization;
    if(h && h.startsWith('Bearer ')){
      try{ const jwt=require('jsonwebtoken'); const sec=process.env.JWT_SECRET||'dev-secret-change-in-prod-32chars!'; req.user=jwt.verify(h.slice(7), sec);}catch{}
    }
    if(!req.user) req.user={ id:'usr_anon_poody', role:'owner' };
    return next();
  }
  return authMiddleware(req,res,next);
});

// CATALOG
app.get('/api/v1/catalog', (req,res)=>{ res.json(POODY_CATALOG); });

// HELPERS
function computeSalesTotals(items){
  let revenue=0,cost=0;
  const norm=[];
  for(const it of items){
    const variant=(it.variant||'').toLowerCase();
    const size=(it.size||'M').toUpperCase();
    const qty=Math.max(0, parseInt(it.qty||0,10));
    if(!qty) continue;
    if(!POODY_CATALOG.variants.includes(variant)) throw new Error(`variant tidak dikenal: ${variant}`);
    const s=POODY_CATALOG.sizes[size];
    if(!s) throw new Error(`size harus M atau L, dapat: ${size}`);
    // toppings: array of string keys, case-insensitive, normalized to catalog key
    const rawTops = Array.isArray(it.toppings) ? it.toppings : [];
    const toppings=[];
    let topPrice=0, topHpp=0;
    for(const t of rawTops){
      const key=(t||'').toString().toLowerCase().trim();
      // find catalog key case-insensitive
      const foundKey = Object.keys(POODY_CATALOG.toppings).find(k=>k.toLowerCase()===key);
      if(!foundKey) throw new Error(`topping tidak dikenal: ${t}`);
      const top=POODY_CATALOG.toppings[foundKey];
      toppings.push(foundKey);
      topPrice+=top.price;
      topHpp+=top.hpp;
    }
    const unitPrice=s.price+topPrice;
    const unitHpp=s.hpp+topHpp;
    const rev=qty*unitPrice, c=qty*unitHpp;
    revenue+=rev; cost+=c;
    norm.push({ variant, size, qty, price:s.price, hpp:s.hpp, toppings, topping_price:topPrice, topping_hpp:topHpp, unit_price:unitPrice, unit_hpp:unitHpp, revenue:rev, cost:c, profit:rev-c });
  }
  return { items:norm, revenue, cost, profit:revenue-cost, total_cups: norm.reduce((a,b)=>a+b.qty,0) };
}
function todayStr(){ return new Date().toISOString().slice(0,10); }

 // SALES
app.post('/api/v1/sales', async (req,res)=>{
  try{
    const business_id=req.body.business_id||DEFAULT_BIZ;
    const date=(req.body.date||todayStr()).slice(0,10);
    const items=req.body.items||[];
    if(!items.length) return res.status(400).json({error:'items required: [{variant,size,qty}]'});
    const calc=computeSalesTotals(items);
    if(!calc.total_cups) return res.status(400).json({error:'qty 0 semua'});
    const db=loadDB();
    const id=`sale_${Date.now().toString(36)}`;
    const rec={ id, business_id, date, ...calc, note:req.body.note||'', created_at:new Date().toISOString(), created_by:req.user?.id||'anon' };
    db.sales=db.sales||[]; db.sales.push(rec); await saveDB(db);
    res.status(201).json(rec);
  }catch(e){ res.status(400).json({error:e.message}); }
});
app.get('/api/v1/sales', (req,res)=>{
  const db=loadDB();
  let data=db.sales||[];
  if(req.query.business_id) data=data.filter(s=>s.business_id===req.query.business_id);
  if(req.query.date) data=data.filter(s=>s.date===req.query.date);
  if(req.query.from) data=data.filter(s=>s.date>=req.query.from);
  if(req.query.to) data=data.filter(s=>s.date<=req.query.to);
  data=data.slice().sort((a,b)=> b.created_at.localeCompare(a.created_at));
  res.json({ data, catalog: POODY_CATALOG });
});
app.delete('/api/v1/sales/:id', async (req,res)=>{
  const db=loadDB(); const idx=(db.sales||[]).findIndex(s=>s.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'not_found'});
  const removed=db.sales.splice(idx,1)[0]; await saveDB(db); res.json({ok:true, removed});
});

// EXPENSES
app.post('/api/v1/expenses', async (req,res)=>{
  const business_id=req.body.business_id||DEFAULT_BIZ;
  const date=(req.body.date||todayStr()).slice(0,10);
  const amount=Math.max(0, parseInt(req.body.amount||0,10));
  if(!amount) return res.status(400).json({error:'amount required >0'});
  const db=loadDB();
  const rec={ id:`exp_${Date.now().toString(36)}`, business_id, date, title:req.body.title||'Pengeluaran', category:req.body.category||'operasional', amount, note:req.body.note||'', created_at:new Date().toISOString(), created_by:req.user?.id||'anon' };
  db.expenses=db.expenses||[]; db.expenses.push(rec); await saveDB(db);
  res.status(201).json(rec);
});
app.get('/api/v1/expenses', (req,res)=>{
  const db=loadDB(); let data=db.expenses||[];
  if(req.query.business_id) data=data.filter(e=>e.business_id===req.query.business_id);
  if(req.query.date) data=data.filter(e=>e.date===req.query.date);
  if(req.query.from) data=data.filter(e=>e.date>=req.query.from);
  if(req.query.to) data=data.filter(e=>e.date<=req.query.to);
  data=data.slice().sort((a,b)=> b.created_at.localeCompare(a.created_at));
  res.json({ data });
});
app.delete('/api/v1/expenses/:id', async (req,res)=>{
  const db=loadDB(); const idx=(db.expenses||[]).findIndex(e=>e.id===req.params.id);
  if(idx===-1) return res.status(404).json({error:'not_found'});
  const removed=db.expenses.splice(idx,1)[0]; await saveDB(db); res.json({ok:true, removed});
});

// DASHBOARD SUMMARY per tanggal
app.get('/api/v1/dashboard/summary', (req,res)=>{
  const business_id=req.query.business_id||DEFAULT_BIZ;
  const date=(req.query.date||todayStr()).slice(0,10);
  const db=loadDB();
  const sales=(db.sales||[]).filter(s=>s.business_id===business_id && s.date===date);
  const expenses=(db.expenses||[]).filter(e=>e.business_id===business_id && e.date===date);
  const salesRevenue=sales.reduce((a,b)=>a+b.revenue,0);
  const salesCost=sales.reduce((a,b)=>a+b.cost,0);
  const salesProfit=salesRevenue-salesCost;
  const expenseTotal=expenses.reduce((a,b)=>a+b.amount,0);
  const expensePribadi=expenses.filter(e=>(e.category||'').toLowerCase()==='pribadi').reduce((a,b)=>a+b.amount,0);
  const expenseBiz=expenseTotal-expensePribadi;
  const netBiz=salesProfit-expenseBiz;
  const netProfit=salesProfit-expenseTotal;
  // per varian/size/topping
  const byVariant={}; const bySize={M:0,L:0}; const byTopping={}; let toppingRevenue=0, toppingCost=0;
  for(const s of sales) for(const it of s.items){
    byVariant[it.variant]=(byVariant[it.variant]||0)+it.qty;
    bySize[it.size]+=it.qty;
    const tops=it.toppings||[];
    for(const t of tops){ byTopping[t]=(byTopping[t]||0)+it.qty; }
    if(it.topping_price) toppingRevenue+=it.topping_price*it.qty;
    if(it.topping_hpp) toppingCost+=it.topping_hpp*it.qty;
  }
  const bestVariant=Object.entries(byVariant).sort((a,b)=>b[1]-a[1])[0];
  const bestTopping=Object.entries(byTopping).sort((a,b)=>b[1]-a[1])[0];
  res.json({
    business_id, date,
    sales:{ count:sales.length, cups:sales.reduce((a,b)=>a+b.total_cups,0), revenue:salesRevenue, cost:salesCost, profit:salesProfit, byVariant, bySize, byTopping, toppingRevenue, toppingCost, toppingProfit: toppingRevenue-toppingCost, bestVariant: bestVariant? {variant:bestVariant[0], qty:bestVariant[1]}:null, bestTopping: bestTopping? {topping:bestTopping[0], qty:bestTopping[1]}:null },
    expenses:{ count:expenses.length, total:expenseTotal, totalBiz:expenseBiz, totalPribadi:expensePribadi, items:expenses },
    net:{ revenue:salesRevenue, expenseTotal, expenseBiz, expensePribadi, profit:netProfit, profitBiz:netBiz, margin: salesRevenue? (netProfit/salesRevenue*100).toFixed(1)+'%':'-', marginBiz: salesRevenue? (netBiz/salesRevenue*100).toFixed(1)+'%':'-' },
    catalog: POODY_CATALOG,
    sales_raw: sales
  });
});
app.get('/api/v1/dashboard/today', (req,res)=>{
  // alias summary today
  req.query.date=todayStr(); 
  return app._router.handle(Object.assign(req,{url:'/api/v1/dashboard/summary?business_id='+(req.query.business_id||DEFAULT_BIZ)+'&date='+req.query.date}), res, ()=>{});
});

// === BRIEFING B2 (exclude pribadi) ===
app.get('/api/v1/briefing/today', (req,res)=>{
  const biz=req.query.business_id||DEFAULT_BIZ;
  const date=(req.query.date||'').slice(0,10) || null;
  // date explicit or yesterday
  const ref = date || new Date(Date.now()-86400000).toISOString().slice(0,10);
  // if query date is today, treat as yesterday? keep ref as requested
  const qDate = date || ref;
  // we want yesterday if no date, else that date
  const targetDate = date || ref;
  const b=buildBriefing(biz, targetDate);
  res.json({ ...b, text: formatBriefingText(b), mode: isMock()?'MOCK':'LLM' });
});
app.get('/api/v1/briefing/latest', (req,res)=>{
  const db=loadDB();
  const arr=(db.briefings||[]).slice().sort((a,b)=> b.generated_at.localeCompare(a.generated_at));
  const latest=arr[0]||null;
  if(!latest) return res.json({ briefing:null, text:'Belum ada briefing tersimpan. Generate dulu.' });
  res.json({ briefing:latest, text:latest.text || formatBriefingText(latest) });
});
app.post('/api/v1/briefing/run', async (req,res)=>{
  const biz=req.body.business_id||DEFAULT_BIZ;
  const date=(req.body.date||'').slice(0,10) || null;
  const targetDate = date || new Date(Date.now()-86400000).toISOString().slice(0,10);
  const b=buildBriefing(biz, targetDate);
  const text=formatBriefingText(b);
  const db=loadDB();
  db.briefings=db.briefings||[];
  const rec={ id:`brf_${Date.now().toString(36)}`, business_id:biz, date:b.date, ...b, text, created_at:new Date().toISOString(), created_by:req.user?.id||'anon' };
  db.briefings.push(rec);
  if(db.briefings.length>200) db.briefings=db.briefings.slice(-200);
  db.memories.push({ id:`mem_${Date.now().toString(36)}`, business_id:biz, type:'briefing', key:`briefing_${b.date}`, value:{ text, briefing:b }, created_at:new Date().toISOString(), created_by:req.user?.id||'anon' });
  await saveDB(db);
  res.status(201).json({ ...rec, text });
});

app.get('/api/v1/forecast/7d', (req,res)=>{
  const biz=req.query.business_id||DEFAULT_BIZ;
  const f=buildForecast(biz);
  res.json(f);
});
app.get('/api/v1/kpi/status', (req,res)=>{
  const biz=req.query.business_id||DEFAULT_BIZ;
  const date=(req.query.date||'').slice(0,10) || null;
  const k=buildKpiStatus(biz, date);
  res.json(k);
});
app.get('/api/v1/forecast/alerts', (req,res)=>{
  const biz=req.query.business_id||DEFAULT_BIZ;
  const f=buildForecast(biz);
  res.json({ alerts:f.alerts, threeStreak:f.threeStreak, maxStreak:f.maxStreak, series:f.series.slice(-7) });
});

// === BUSINESSES B4 ===
app.get('/api/v1/businesses', (req,res)=>{
  const db=loadDB();
  res.json({ data: db.businesses||[], catalog: POODY_CATALOG });
});
app.post('/api/v1/businesses', async (req,res)=>{
  const { id, name, type, avg_daily_revenue } = req.body;
  if(!id || !name) return res.status(400).json({error:'id & name required, e.g. {id:"biz_cikarang", name:"Poody Cikarang"}'});
  const db=loadDB();
  if((db.businesses||[]).find(b=>b.id===id)) return res.status(409).json({error:'id_exists', id});
  const biz={ id, name, type: type||'F&B Dessert', avg_daily_revenue: parseInt(avg_daily_revenue||200000,10) };
  db.businesses=db.businesses||[];
  db.businesses.push(biz);
  await saveDB(db);
  res.status(201).json(biz);
});
app.post('/api/v1/sync/sheets', async (req,res)=>{
  const business_id=req.body.business_id || req.query.business_id || DEFAULT_BIZ;
  const spreadsheetId=req.body.spreadsheetId || req.query.spreadsheetId || '1MMS_23QeS5rUScwAaGM35ooxxCSoy2SX';
  try{
    const summary=await syncSheets({ spreadsheetId, businessId: business_id });
    res.json({ ok:true, business_id, spreadsheetId, summary });
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});
app.get('/api/v1/rag/search', (req,res)=>{
  const q=(req.query.q||req.query.query||'').toString().slice(0,120);
  if(!q) return res.status(400).json({error:'q required'});
  const biz=req.query.business_id||DEFAULT_BIZ;
  const limit=Math.min(20, Math.max(1, parseInt(req.query.limit||'6',10)));
  const r=searchRag({ business_id: biz, query: q, limit });
  res.json(r);
});

app.get('/api/v1/dashboard/overview', (req,res)=>{
  const db=loadDB();
  res.json({ ok:true, persist:{workflows:db.workflows.length, tasks:db.tasks.length, memories:db.memories.length, sales:(db.sales||[]).length, expenses:(db.expenses||[]).length }, catalog: POODY_CATALOG });
});

// CHAT
app.post('/api/v1/agents/:key/chat', async (req,res)=>{
  const {key}=req.params; const {message,stream}=req.body;
  if(!message) return res.status(400).json({error:'message required'});
  if(stream && isMock()){
    res.setHeader('Content-Type','text/event-stream'); res.setHeader('Cache-Control','no-cache'); res.setHeader('Connection','keep-alive');
    const send=(event,data)=>res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('agent_thinking',{agent:key,status:'MOCK thinking...'});
    setTimeout(async()=>{ const text=await callLLM(key,message); const tokens=text.split(/(\s+)/); let i=0; const iv=setInterval(()=>{ if(i<tokens.length) send('token',{text:tokens[i++]}); else{ clearInterval(iv); send('done',{conversation_id:`conv_${Date.now()}`,mode:'MOCK'}); res.end(); } },60); },300);
    return;
  }
  // inject real data for context (exclude pribadi)
  const _biz=req.body.business_id||DEFAULT_BIZ;
  const _db=loadDB();
  const _sumFor=(biz, dates)=>{
    const ss=( _db.sales||[]).filter(x=>x.business_id===biz && dates.includes(x.date));
    const ee=( _db.expenses||[]).filter(x=>x.business_id===biz && dates.includes(x.date) && (x.category||'').toLowerCase()!=='pribadi');
    const rev=ss.reduce((a,b)=>a+b.revenue,0), cost=ss.reduce((a,b)=>a+b.cost,0);
    return { rev, cost, exp: ee.reduce((a,b)=>a+b.amount,0), cups: ss.reduce((a,b)=>a+b.total_cups,0), net: rev-cost-ee.reduce((a,b)=>a+b.amount,0) };
  };
  // quick month totals for context
  const _months=['2026-07','2026-08'];
  const _monthCtx=_months.map(m=>{
    const ss=(_db.sales||[]).filter(x=>x.business_id===_biz && x.date.startsWith(m));
    const ee=(_db.expenses||[]).filter(x=>x.business_id===_biz && x.date.startsWith(m) && (x.category||'').toLowerCase()!=='pribadi');
    const rev=ss.reduce((a,b)=>a+b.revenue,0);
    const exp=ee.reduce((a,b)=>a+b.amount,0);
    const profit=ss.reduce((a,b)=>a+b.profit,0);
    return `${m}: omset ${rev.toLocaleString('id-ID')} (${ss.length} nota, ${ss.reduce((a,b)=>a+b.total_cups,0)} cup) laba usaha ${(profit-exp).toLocaleString('id-ID')} (exp usaha ${exp.toLocaleString('id-ID')})`;
  }).join(' | ');
  const _yest=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const _y=_sumFor(_biz, [_yest]);
  let _rag="";
  let _ragHits=[];
  try{
    const _r=searchRag({ business_id: _biz, query: message, limit: 5 });
    _ragHits=_r.hits||[];
    if(_ragHits.length) _rag=_ragHits.map(h=> `[${h.type} ${h.date||''} score:${h.score}] ${h.snippet}`).join('\n - ');
  }catch(e){ _rag=""; }
  let chatMessage=message;
  if(key==='ceo'){
    const _ragBlock=_rag?`\nMemori relevan (RAG top 5, pakai jika nyambung):\n - ${_rag}`:"";
    chatMessage=`Konteks: Kamu CEO Agent Poody (UMKM dessert). Katalog: 6 rasa chocolatte/matcha/mango/strawberry/taro/bubblemgum, M HPP5100/10000 L HPP6100/12000, target 200rb/hari (~20 cup). DATA REAL: ${_monthCtx}. Kemarin ${_yest}: omset ${_y.rev} exp usaha ${_y.exp} net ${_y.net} ${_y.cups} cup.\nUser: "${message}"\nInstruksi: Gunakan DATA REAL di atas, jangan minta data lagi.${_ragBlock} Jawab natural ID ringkas. Jika analisis -> pakai angka real + 2-3 saran. Jangan JSON DAG kecuali diminta workflow. Jika estimasi, label ESTIMATION.`;
  } else if(key==='financial_analyst'){
    const _ragBlock=_rag?` RAG: ${_rag}`:"";
    chatMessage=`Kamu Financial Analyst Poody. DATA REAL: ${_monthCtx}. Kemarin ${_yest}: omset ${_y.rev} cups ${_y.cups} net usaha ${_y.net}.${_ragBlock} User: "${message}" Jawab analisis keuangan pakai angka real, pisah laba usaha vs sisa kas (exclude pribadi), beri 3 insight + saran. ID ringkas.`;
  } else if(key==='marketing_manager'){
    const _ragBlock=_rag?` RAG: ${_rag}`:"";
    chatMessage=`Kamu Marketing Manager Poody. DATA REAL: ${_monthCtx}.${_ragBlock} User: "${message}" Beri strategi jualan/topping/promo pakai data real. ID ringkas.`;
  }
  try{
    const reply=await callLLM(key, chatMessage);
    const db=loadDB(); db.memories.push({ id:`mem_${Date.now().toString(36)}`, business_id: req.body.business_id||DEFAULT_BIZ, type:'episodic', key:`chat_${key}_${Date.now()}`, value:{agent:key,user:message,reply,model:model()}, created_at:new Date().toISOString(), created_by:req.user?.id||'anon' });
    if(db.memories.length>500) db.memories=db.memories.slice(-500); await saveDB(db);
    res.json({ conversation_id:`conv_${Date.now()}`, agent:key, reply, mode: isMock()?'MOCK':'LLM', model:model(), rag: _ragHits });
  }catch(e){ console.error(e); res.status(500).json({error:'llm_error',message:e.message}); }
});

// WORKFLOWS
app.post('/api/v1/workflows', async (req,res)=>{
  const {business_id,objective,priority}=req.body;
  if(!objective) return res.status(400).json({error:'objective required'});
  const prompt=`Business_id: ${business_id||DEFAULT_BIZ}\nObjective: "${objective}"\nPriority: ${priority||'medium'}\nKonteks: Poody UMKM dessert 6 rasa, Size M HPP5100/10000 Size L HPP6100/12000, omset 200rb/hari.\nTugas CEO: 1. pemahaman singkat 2. pecah 3-5 tasks (pilih agent: financial_analyst,cashflow_analyst,forecasting,marketing_manager,performance_marketing,social_media,copywriter,seo,business_strategist,market_research,competitor_analyst,growth,data_analyst) 3. tiap task: objective,priority,requires_approval 4. data needed 5. confidence 0-100\nOutput JSON: {"understanding":"...","tasks":[{"agent":"...","objective":"...","priority":"...","requires_approval":false}],"next_data_needed":["..."],"confidence":0-100,"risk_note":"..."}\n`;
  try{
    const raw=await callLLM('ceo', prompt, {json:!isMock(), maxTokens:1400});
    const cleaned=raw.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/i,'').trim();
    let parsed; try{ parsed=JSON.parse(cleaned);}catch{ parsed={raw, parse_error:'LLM tidak return JSON valid'}; }
    const wf={ workflow_id:`wf_${Date.now().toString(36)}`, business_id:business_id||DEFAULT_BIZ, objective, priority:priority||'medium', mode:isMock()?'MOCK':'LLM', model:model(), ...parsed, status:'planning', created_at:new Date().toISOString(), created_by:req.user?.id||'anon' };
    const db=loadDB(); db.workflows.push(wf);
    const tasks=(parsed.tasks||[]).map((t,i)=>({ id:`tsk_${wf.workflow_id}_${i}`, workflow_id:wf.workflow_id, business_id:wf.business_id, agent:t.agent, objective:t.objective, priority:t.priority||'medium', requires_approval:!!t.requires_approval, status:t.requires_approval?'awaiting_approval':'assigned', created_at:new Date().toISOString() }));
    db.tasks.push(...tasks); await saveDB(db);
    res.status(201).json({...wf, tasks});
  }catch(e){ console.error(e); res.status(500).json({error:'llm_error',message:e.message}); }
});
app.get('/api/v1/workflows', (req,res)=>{ const db=loadDB(); let data=db.workflows; if(req.query.business_id) data=data.filter(w=>w.business_id===req.query.business_id); if(req.query.status) data=data.filter(w=>w.status===req.query.status); res.json({data:data.slice(-50).reverse()}); });
app.get('/api/v1/workflows/:id', (req,res)=>{ const db=loadDB(); const w=db.workflows.find(x=>x.workflow_id===req.params.id); if(!w) return res.status(404).json({error:'not_found'}); const tasks=db.tasks.filter(t=>t.workflow_id===w.workflow_id); res.json({...w,tasks}); });
app.post('/api/v1/workflows/:id/approve', async (req,res)=>{ const db=loadDB(); const w=db.workflows.find(x=>x.workflow_id===req.params.id); if(!w) return res.status(404).json({error:'not_found'}); w.status=req.body.decision==='approved'?'working':'rejected'; w.approval={decision:req.body.decision,reason:req.body.reason,decided_by:req.user?.id,decided_at:new Date().toISOString()}; db.tasks.filter(t=>t.workflow_id===w.workflow_id && t.requires_approval).forEach(t=> t.status=req.body.decision==='approved'?'assigned':'rejected'); await saveDB(db); res.json({ok:true, workflow:w}); });
app.get('/api/v1/tasks', (req,res)=>{ const db=loadDB(); let data=db.tasks; if(req.query.workflow_id) data=data.filter(t=>t.workflow_id===req.query.workflow_id); if(req.query.agent) data=data.filter(t=>t.agent===req.query.agent); res.json({data:data.slice(-100).reverse()}); });
app.patch('/api/v1/tasks/:id', async (req,res)=>{ const db=loadDB(); const t=db.tasks.find(x=>x.id===req.params.id); if(!t) return res.status(404).json({error:'not_found'}); Object.assign(t, req.body, {updated_at:new Date().toISOString()}); await saveDB(db); res.json(t); });
app.get('/api/v1/memories', (req,res)=>{ const db=loadDB(); let data=db.memories; if(req.query.business_id) data=data.filter(m=>m.business_id===req.query.business_id); if(req.query.type) data=data.filter(m=>m.type===req.query.type); res.json({data:data.slice(-50).reverse()}); });
app.post('/api/v1/memories', async (req,res)=>{ const db=loadDB(); const m={ id:`mem_${Date.now().toString(36)}`, created_at:new Date().toISOString(), created_by:req.user?.id, ...req.body }; db.memories.push(m); await saveDB(db); res.status(201).json(m); });

// IMAGE
app.post('/api/v1/image/summarize', upload.single('image'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'image file required (field: image)'});
    const prompt=req.body.prompt||'Deskripsikan foto Poody ini (rasa, size, topping, kemasan, pencahayaan) lalu beri 3 saran agar foto lebih laku dijual.';
    const base64=req.file.buffer.toString('base64'); const mime=req.file.mimetype||'image/jpeg';
    const reply=await callLLM('data_analyst', prompt, {imageBase64:base64,imageMime:mime,maxTokens:900});
    const db=loadDB(); db.memories.push({id:`mem_${Date.now().toString(36)}`,business_id:DEFAULT_BIZ,type:'episodic',key:'image_summarize',value:{prompt,mime,size:req.file.size,reply},created_at:new Date().toISOString()}); await saveDB(db);
    res.json({ok:true,model:model(),mime,size:req.file.size,prompt,reply});
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/v1/image/transform', upload.single('image'), async (req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:'image file required'});
    const style=req.body.style||'studio katalog pudding, background putih bersih'; const extra=req.body.prompt||'';
    const base64=req.file.buffer.toString('base64'); const mime=req.file.mimetype||'image/jpeg';
    const prompt=`Kamu Image-to-Image specialist Poody Dessert. Gaya: "${style}". Extra: "${extra}". 1. Deskripsikan foto asli singkat 2. Buat optimized prompt untuk SDXL agar foto katalog pudding konsisten 3. 3 tips foto. Bahasa Indonesia.`;
    const reply=await callLLM('copywriter', prompt, {imageBase64:base64,imageMime:mime,maxTokens:900});
    const db=loadDB(); db.memories.push({id:`mem_${Date.now().toString(36)}`,business_id:DEFAULT_BIZ,type:'episodic',key:'image_transform',value:{style,extra,mime,reply},created_at:new Date().toISOString()}); await saveDB(db);
    res.json({ok:true,model:model(),style,reply});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// === EXPORT EXCEL + RECEIPT (B1) ===
function buildExportRange(business_id, from, to){
  const db=loadDB();
  let sales=(db.sales||[]).filter(s=>s.business_id===business_id);
  let exps=(db.expenses||[]).filter(e=>e.business_id===business_id);
  if(from) { sales=sales.filter(s=>s.date>=from); exps=exps.filter(e=>e.date>=from); }
  if(to)   { sales=sales.filter(s=>s.date<=to);   exps=exps.filter(e=>e.date<=to); }
  sales=sales.slice().sort((a,b)=> a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  exps=exps.slice().sort((a,b)=> a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const byDate={};
  for(const s of sales){ byDate[s.date]=byDate[s.date]||{sales:[],exps:[]}; byDate[s.date].sales.push(s); }
  for(const e of exps){ byDate[e.date]=byDate[e.date]||{sales:[],exps:[]}; byDate[e.date].exps.push(e); }
  return { sales, exps, byDate };
}
app.get('/api/v1/export/excel', (req,res)=>{
  try{
    const business_id=req.query.business_id||DEFAULT_BIZ;
    const from=(req.query.from||'').slice(0,10) || null;
    const to=(req.query.to||'').slice(0,10) || null;
    const { sales, exps, byDate } = buildExportRange(business_id, from, to);
    const title=`Poody Laporan ${from||'awal'} s/d ${to||'akhir'}`;

    // Sheet 1: Ringkasan harian (pisah Pribadi/PISAHIN)
    const summaryRows=[['Tanggal','Cup','Omset','HPP','Laba Kotor','Pengeluaran Usaha','Ambil Pribadi','Laba Bersih Usaha','Laba Bersih Total','Margin Usaha','Rasa Terlaris','Topping Terlaris']];
    let totCup=0, totRev=0, totCost=0, totExpBiz=0, totExpPribadi=0, totNetBiz=0, totNet=0;
    Object.keys(byDate).sort().forEach(d=>{
      const s=byDate[d].sales, e=byDate[d].exps;
      const rev=s.reduce((a,b)=>a+b.revenue,0), cost=s.reduce((a,b)=>a+b.cost,0), cups=s.reduce((a,b)=>a+b.total_cups,0), expTot=e.reduce((a,b)=>a+b.amount,0), expPribadi=e.filter(x=>(x.category||'').toLowerCase()==='pribadi').reduce((a,b)=>a+b.amount,0), expBiz=expTot-expPribadi, netBiz=rev-cost-expBiz, net=rev-cost-expTot;
      const byV={}; const byT={};
      for(const x of s) for(const it of x.items){ byV[it.variant]=(byV[it.variant]||0)+it.qty; (it.toppings||[]).forEach(t=> byT[t]=(byT[t]||0)+it.qty); }
      const bestV=Object.entries(byV).sort((a,b)=>b[1]-a[1])[0];
      const bestT=Object.entries(byT).sort((a,b)=>b[1]-a[1])[0];
      summaryRows.push([d,cups,rev,cost,rev-cost,expBiz,expPribadi,netBiz,net, rev? ((netBiz/rev*100).toFixed(1)+'%'):'-', bestV?`${bestV[0]} (${bestV[1]})`:'-', bestT?`${bestT[0]} (${bestT[1]})`:'-']);
      totCup+=cups; totRev+=rev; totCost+=cost; totExpBiz+=expBiz; totExpPribadi+=expPribadi; totNetBiz+=netBiz; totNet+=net;
    });
    summaryRows.push(['TOTAL',totCup,totRev,totCost,totRev-totCost,totExpBiz,totExpPribadi,totNetBiz,totNet, totRev?((totNetBiz/totRev*100).toFixed(1)+'%'):'-','','']);

    // Sheet 2: Detail transaksi
    const detailRows=[['Tanggal','Waktu','Varian','Size','Qty','Topping','Harga Satuan','HPP Satuan','Revenue','Cost','Profit','Catatan']];
    for(const s of sales){
      for(const it of s.items){
        detailRows.push([s.date, s.created_at.slice(11,19), it.variant, it.size, it.qty, (it.toppings||[]).join(' + ')||'-', it.unit_price, it.unit_hpp, it.revenue, it.cost, it.profit, s.note||'']);
      }
    }
    if(detailRows.length===1) detailRows.push(['-','-','-','-','-','-','-','-','-','-','-','-']);

    // Sheet 3: Pengeluaran
    const expRows=[['Tanggal','Judul','Kategori','Nominal','Catatan']];
    for(const e of exps) expRows.push([e.date,e.title,e.category,e.amount,e.note||'']);
    if(expRows.length===1) expRows.push(['-','-','-','-','-']);

    // Sheet 4: Per varian
    const byV2={}, byS2={M:0,L:0}, byT2={};
    for(const s of sales) for(const it of s.items){ byV2[it.variant]=(byV2[it.variant]||0)+it.qty; byS2[it.size]+=it.qty; (it.toppings||[]).forEach(t=> byT2[t]=(byT2[t]||0)+it.qty); }
    const varianRows=[['Varian','Cup Terjual']]; Object.entries(byV2).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=> varianRows.push([k,v]));
    varianRows.push([]); varianRows.push(['Size','Cup']); Object.entries(byS2).forEach(([k,v])=> varianRows.push([k,v]));
    varianRows.push([]); varianRows.push(['Topping','Cup']); Object.entries(byT2).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=> varianRows.push([k,v]));

    const wb=XLSX.utils.book_new();
    const ws1=XLSX.utils.aoa_to_sheet([[title],[],...summaryRows]);
    ws1['!cols']=[{wch:12},{wch:8},{wch:12},{wch:12},{wch:12},{wch:13},{wch:12},{wch:14},{wch:14},{wch:10},{wch:18},{wch:18}];
    // bold header
    XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), 'Detail');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(expRows), 'Pengeluaran');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(varianRows), 'Per Varian');
    // number format for currency cols
    const buf=XLSX.write(wb,{type:'buffer', bookType:'xlsx'});
    const fname=`Poody_${from||'awal'}_${to||'akhir'}.xlsx`;
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${fname}"`);
    res.send(buf);
  }catch(e){ console.error(e); res.status(500).json({error:e.message}); }
});
app.get('/api/v1/export/receipt', (req,res)=>{
  const business_id=req.query.business_id||DEFAULT_BIZ;
  const date=(req.query.date||todayStr()).slice(0,10);
  const db=loadDB();
  const sales=(db.sales||[]).filter(s=>s.business_id===business_id && s.date===date);
  const exps=(db.expenses||[]).filter(e=>e.business_id===business_id && e.date===date);
  if(!sales.length && !exps.length) return res.status(404).json({error:'no_data', date});
  const rev=sales.reduce((a,b)=>a+b.revenue,0), cost=sales.reduce((a,b)=>a+b.cost,0), cups=sales.reduce((a,b)=>a+b.total_cups,0), expTot=exps.reduce((a,b)=>a+b.amount,0), expPribadi=exps.filter(e=>(e.category||'').toLowerCase()==='pribadi').reduce((a,b)=>a+b.amount,0), expBiz=expTot-expPribadi;
  const byV={}; for(const s of sales) for(const it of s.items) byV[it.variant]=(byV[it.variant]||0)+it.qty;
  const best=Object.entries(byV).sort((a,b)=>b[1]-a[1])[0];
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>Struk Poody ${date}</title><style>
  *{box-sizing:border-box} body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f1f5f9;color:#0f172a}
  .paper{max-width:380px;margin:16px auto;background:white;border:1px solid #e2e8f0;border-radius:14px;padding:16px}
  h1{margin:0;font-size:18px;text-align:center} .sub{font-size:11px;color:#64748b;text-align:center;margin-top:4px}
  .line{border-top:1px dashed #cbd5e1;margin:10px 0} .row{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}
  .row b{font-size:13px} .small{font-size:11px;color:#64748b} .total{font-weight:800;font-size:14px}
  @media print{ body{background:white} .paper{border:none;margin:0;max-width:none} .no-print{display:none} }
  </style></head><body><div class="paper">
  <h1>🍮 POODY Poody</h1><div class="sub">UMKM Dessert • ${date} • ${business_id}</div>
  <div class="line"></div>
  ${sales.map(s=> s.items.map(it=> `<div class="row"><span>${it.variant} ${it.size} x${it.qty} ${(it.toppings&&it.toppings.length)?`<span class="small">+${it.toppings.join('+')}</span>`:''}</span><span>${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(it.revenue)}</span></div>`).join('')).join('') || '<div class="small">Tidak ada penjualan</div>'}
  <div class="line"></div>
  <div class="row"><span>Cup terjual</span><b>${cups}</b></div>
  <div class="row"><span>Omset</span><b>${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(rev)}</b></div>
  <div class="row"><span>HPP</span><span>${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(cost)}</span></div>
  <div class="row"><span>Laba kotor</span><span>${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(rev-cost)}</span></div>
  ${exps.length? `<div class="line"></div><div class="small">Pengeluaran usaha: ${exps.filter(e=>(e.category||'').toLowerCase()!=='pribadi').map(e=> `${e.title} ${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(e.amount)}`).join(' • ')||'-'}</div><div class="row"><span>Pengeluaran usaha</span><span>${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(expBiz)}</span></div>${expPribadi? `<div class="small">Ambil pribadi (PISAHIN): ${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(expPribadi)}</div><div class="row"><span>Ambil pribadi</span><span>${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(expPribadi)}</span></div>`:''}`:''}
  <div class="line"></div>
  <div class="row total" style="color:#065F46"><span>Laba bersih usaha</span><span>${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(rev-cost-expBiz)}</span></div>
  ${expPribadi? `<div class="row small"><span>Sisa kas (setelah pribadi)</span><span>${new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(rev-cost-expTot)}</span></div>`:''}
  <div class="small" style="margin-top:6px">Margin ${rev?((rev-cost-expTot)/rev*100).toFixed(1):'-'}% • Terlaris ${best?best[0]:'-'} • Cetak: ${new Date().toLocaleString('id-ID')}</div>
  <div class="line"></div><div class="small" style="text-align:center">Terima kasih Bos Ikun! — Poody Business OS</div>
  <div class="no-print" style="display:flex;gap:8px;margin-top:10px"><button onclick="window.print()" style="flex:1;padding:10px;border-radius:10px;border:1px solid #0f172a;background:#0f172a;color:white;font-weight:700;cursor:pointer">🖨️ Cetak</button><button onclick="window.close()" style="flex:1;padding:10px;border-radius:10px;border:1px solid #e2e8f0;background:white;font-weight:700;cursor:pointer">Tutup</button></div>
  </div></body></html>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

if (!process.env.VERCEL) {
  app.listen(PORT, ()=>{ console.log(`✅ Agentic Prototype (Poody) jalan di http://localhost:${PORT} mode=${isMock()?'MOCK':'LLM:'+model()}`); console.log(`   Catalog: 6 rasa x M 5100/10000 L 6100/12000 | Sales: POST /api/v1/sales {date,items:[{variant,size,qty}]}`); });
}
module.exports = app;
