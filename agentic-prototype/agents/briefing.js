// Briefing builder — yesterday vs target, laba usaha exclude pribadi
const { loadDB, POODY_CATALOG } = require('./storage');

function ymd(d){ return d.toISOString().slice(0,10); }
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n); }
function yesterdayStr(ref){
  const d = ref ? new Date(ref) : new Date();
  // if ref is YYYY-MM-DD string
  let base;
  if(typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ref)){
    base = new Date(ref + 'T12:00:00');
    base.setDate(base.getDate() - 1);
    if(ref) return ymd(base);
  }
  base = new Date();
  base.setDate(base.getDate() - 1);
  return ymd(base);
}
function loadDay(business_id, date){
  const db = loadDB();
  const sales = (db.sales||[]).filter(s=>s.business_id===business_id && s.date===date);
  const expenses = (db.expenses||[]).filter(e=>e.business_id===business_id && e.date===date);
  const rev = sales.reduce((a,b)=>a+b.revenue,0);
  const cost = sales.reduce((a,b)=>a+b.cost,0);
  const profit = rev - cost;
  const expTot = expenses.reduce((a,b)=>a+b.amount,0);
  const expPri = expenses.filter(e=>(e.category||'').toLowerCase()==='pribadi').reduce((a,b)=>a+b.amount,0);
  const expBiz = expTot - expPri;
  const netBiz = profit - expBiz;
  const net = profit - expTot;
  const cups = sales.reduce((a,b)=>a+b.total_cups,0);
  const byVariant={}; const byTopping={}; let toppingRev=0;
  for(const s of sales) for(const it of s.items){
    byVariant[it.variant]=(byVariant[it.variant]||0)+it.qty;
    (it.toppings||[]).forEach(t=> byTopping[t]=(byTopping[t]||0)+it.qty);
    if(it.topping_price) toppingRev+=it.topping_price*it.qty;
  }
  const bestV = Object.entries(byVariant).sort((a,b)=>b[1]-a[1])[0] || null;
  const bestT = Object.entries(byTopping).sort((a,b)=>b[1]-a[1])[0] || null;
  return { date, sales, expenses, rev, cost, profit, expTot, expPri, expBiz, netBiz, net, cups, byVariant, byTopping, toppingRev, bestV, bestT };
}
function monthRange(dateStr){
  const [y,m]=dateStr.split('-');
  const ym=`${y}-${m}`;
  const from=`${ym}-01`;
  const d=new Date(parseInt(y,10), parseInt(m,10), 0);
  const to=d.toISOString().slice(0,10);
  return { ym, from, to };
}
function buildBriefing(business_id, dateOrYesterday){
  const target = POODY_CATALOG.business?.avg_daily_revenue || 200000;
  const d = dateOrYesterday && /^\d{4}-\d{2}-\d{2}$/.test(dateOrYesterday) ? dateOrYesterday : yesterdayStr();
  // yesterday defaults to yesterday; if today passed explicitly we treat as that day
  const day = loadDay(business_id, d);
  const { ym, from } = monthRange(d);
  const db = loadDB();
  // MTD up to d
  const mtdSales = (db.sales||[]).filter(s=>s.business_id===business_id && s.date>=from && s.date<=d);
  const mtdExp = (db.expenses||[]).filter(e=>e.business_id===business_id && e.date>=from && e.date<=d);
  const mtdRev = mtdSales.reduce((a,b)=>a+b.revenue,0);
  const mtdCost = mtdSales.reduce((a,b)=>a+b.cost,0);
  const mtdProfit = mtdRev - mtdCost;
  const mtdExpTot = mtdExp.reduce((a,b)=>a+b.amount,0);
  const mtdPri = mtdExp.filter(e=>(e.category||'').toLowerCase()==='pribadi').reduce((a,b)=>a+b.amount,0);
  const mtdBiz = mtdExpTot - mtdPri;
  const mtdNetBiz = mtdProfit - mtdBiz;
  const mtdDays = new Set(mtdSales.map(s=>s.date)).size;
  const mtdAvg = mtdDays ? Math.round(mtdRev / mtdDays) : 0;
  // 7 hari terakhir
  const seven=[];
  for(let i=6;i>=0;i--){
    const dt=new Date(d+'T12:00:00'); dt.setDate(dt.getDate()-i);
    const ds=ymd(dt);
    const dy=loadDay(business_id, ds);
    seven.push({ date:ds, rev:dy.rev, netBiz:dy.netBiz });
  }
  // anomalies
  const anomalies=[];
  if(day.expBiz > day.rev * 0.8 && day.rev>0) anomalies.push(`Pengeluaran usaha ${rupiah(day.expBiz)} >80% omset — cek bahan.`);
  if(day.netBiz < 0 && day.cups>0) anomalies.push(`Rugi usaha ${rupiah(day.netBiz)} padahal ${day.cups} cup terjual.`);
  if(day.cups===0) anomalies.push('Belum ada penjualan kemarin.');
  const topExp = [...day.expenses].filter(e=>(e.category||'').toLowerCase()!=='pribadi').sort((a,b)=>b.amount-a.amount)[0];
  if(topExp && topExp.amount > 300000) anomalies.push(`Pengeluaran terbesar: ${topExp.title} ${rupiah(topExp.amount)}.`);
  // status
  const vsTarget = day.rev >= target ? 'lewat target' : `kurang ${rupiah(target - day.rev)}`;
  const health = day.rev>=target && day.netBiz>0 ? 'SEHAT' : day.netBiz<0 ? 'PERLU PERHATIAN' : 'CUKUP';
  const briefing = {
    business_id, date:d, ym, target,
    day, mtd:{ from, to:d, rev:mtdRev, cost:mtdCost, profit:mtdProfit, expTot:mtdExpTot, expBiz:mtdBiz, expPri:mtdPri, netBiz:mtdNetBiz, net:mtdProfit-mtdExpTot, days:mtdDays, avg:mtdAvg, salesCount:mtdSales.length, expCount:mtdExp.length },
    seven, anomalies, vsTarget, health,
    generated_at:new Date().toISOString()
  };
  return briefing;
}
function formatBriefingText(b){
  const d=b.day;
  const lines=[];
  lines.push(`☀️ BRIEFING POODY — ${b.date} (${b.ym})`);
  lines.push(`Omset kemarin ${rupiah(d.rev)} (${d.cups} cup) • ${b.vsTarget} (target ${rupiah(b.target)}) — ${b.health}`);
  lines.push(`Laba usaha ${rupiah(d.netBiz)} (HPP ${rupiah(d.cost)} • usaha ${rupiah(d.expBiz)}${d.expPri?` • pribadi ${rupiah(d.expPri)}`:''}) • sisa kas ${rupiah(d.net)}`);
  if(d.bestV) lines.push(`Terlaris: ${d.bestV[0]} (${d.bestV[1]})${d.bestT?` • topping ${d.bestT[0]} (${d.bestT[1]})`:''}${d.toppingRev?` +${rupiah(d.toppingRev)} topping`:''}`);
  else lines.push('Terlaris: -');
  lines.push(`MTD ${b.mtd.from}–${b.date}: omset ${rupiah(b.mtd.rev)} (${b.mtd.days} hari jualan, rata ${rupiah(b.mtd.avg)}/hari) • laba usaha ${rupiah(b.mtd.netBiz)}${b.mtd.expPri?` • pribadi ${rupiah(b.mtd.expPri)}`:''}`);
  if(b.anomalies.length) lines.push(`Anomali: ${b.anomalies.join(' | ')}`);
  lines.push(`7 hari: ${b.seven.map(x=> `${x.date.slice(5)} ${rupiah(x.rev)}/${rupiah(x.netBiz)}`).join(' • ')}`);
  const saran=[];
  if(d.cups===0) saran.push('Posting sosmed pagi & cek stok topping.');
  else if(d.rev < b.target) saran.push(`Kejar ${rupiah(b.target - d.rev)} lagi — push bundle topping 3rb.`);
  if(d.netBiz<0) saran.push('Kontrol HPP/bahan, tunda ambil pribadi.');
  if(d.bestV) saran.push(`Fokus stok ${d.bestV[0]}.`);
  if(saran.length) lines.push(`Saran: ${saran.join(' ')}`);
  return lines.join('\n');
}
module.exports={ buildBriefing, formatBriefingText, loadDay, rupiah };
