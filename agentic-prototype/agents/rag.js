// RAG keyword search — no deps: scan db.json memories/sales/expenses + workflows
const { loadDB } = require('./storage');

function tokenize(s){
  return (s||'').toString().toLowerCase().split(/[^a-z0-9\u00C0-\u024F]+/i).filter(Boolean);
}
function scoreDoc(queryTokens, docText){
  const text = (docText||'').toLowerCase();
  const tokens = tokenize(docText);
  const set = new Set(tokens);
  let hits=0;
  for(const q of queryTokens){
    if(set.has(q)) hits+=2;
    else if(text.includes(q)) hits+=1;
  }
  // bonus if exact phrase
  return hits;
}
function docTextForMemory(m){
  // m.value may be object
  let v='';
  try{ v = typeof m.value==='string'? m.value : JSON.stringify(m.value); }catch{ v=String(m.value); }
  return `${m.type||''} ${m.key||''} ${v} ${m.id||''}`;
}
function docTextForSale(s){
  return `${s.date} ${s.id} ${s.note||''} ${s.items.map(i=> `${i.variant} ${i.size} x${i.qty} toppings:${(i.toppings||[]).join(' ')} rev:${i.revenue}`).join(' ')} rev:${s.revenue} cost:${s.cost}`;
}
function docTextForExpense(e){
  return `${e.date} ${e.title} ${e.category} ${e.amount} ${e.note||''}`;
}
function searchRag({ business_id, query, limit=6 }){
  const db = loadDB();
  const qTokens = tokenize(query);
  if(!qTokens.length) return { query, hits: [] };
  const hits=[];
  const biz = business_id || 'biz_poody';
  // memories
  for(const m of (db.memories||[]).filter(x=> !business_id || x.business_id===biz)){
    const text = docTextForMemory(m);
    const sc = scoreDoc(qTokens, text);
    if(sc>0) hits.push({ type:'memory', id:m.id, business_id: m.business_id, date: (m.created_at||'').slice(0,10), key: m.key||m.type, snippet: text.slice(0,220), score: sc, raw: m });
  }
  // sales
  for(const s of (db.sales||[]).filter(x=> !business_id || x.business_id===biz)){
    const text = docTextForSale(s);
    const sc = scoreDoc(qTokens, text);
    if(sc>0) hits.push({ type:'sale', id:s.id, business_id: s.business_id, date: s.date, snippet: text.slice(0,220), score: sc, raw: { date:s.date, revenue:s.revenue, cost:s.cost, cups:s.total_cups, items:s.items } });
  }
  // expenses
  for(const e of (db.expenses||[]).filter(x=> !business_id || x.business_id===biz)){
    const text = docTextForExpense(e);
    const sc = scoreDoc(qTokens, text);
    if(sc>0) hits.push({ type:'expense', id:e.id, business_id: e.business_id, date: e.date, snippet: text.slice(0,220), score: sc, raw: { date:e.date, title:e.title, category:e.category, amount:e.amount } });
  }
  // workflows
  for(const w of (db.workflows||[]).filter(x=> !business_id || x.business_id===biz)){
    const text = `${w.objective} ${w.understanding||''} ${w.status} ${(w.tasks||[]).map(t=>t.agent+' '+t.objective).join(' ')}`;
    const sc = scoreDoc(qTokens, text);
    if(sc>0) hits.push({ type:'workflow', id:w.workflow_id, business_id: w.business_id, date: (w.created_at||'').slice(0,10), snippet: text.slice(0,220), score: sc, raw: w });
  }
  hits.sort((a,b)=> b.score - a.score || (b.date||'').localeCompare(a.date||''));
  return { query, business_id: biz, hits: hits.slice(0, limit), total: hits.length };
}

module.exports = { searchRag };
