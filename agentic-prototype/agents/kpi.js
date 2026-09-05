// KPI monitoring — target 200rb/hari, 3-hari streak, MTD, margin, topping
const { loadDB, POODY_CATALOG } = require('./storage');

function ymd(d){ return d.toISOString().slice(0,10); }
function daysInMonth(ym){
  const [y,m]=ym.split('-').map(Number);
  return new Date(y,m,0).getDate();
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
  const cups = sales.reduce((a,b)=>a+b.total_cups,0);
  const toppingRev = sales.reduce((a,s)=> a + s.items.reduce((aa,it)=> aa + (it.topping_price||0)*it.qty, 0), 0);
  return { date, rev, cost, profit, expTot, expBiz, expPri, netBiz, cups, toppingRev, salesCount: sales.length };
}

function buildKpiStatus(business_id, refDate){
  const DEFAULT_TARGET = (POODY_CATALOG.business && POODY_CATALOG.business.avg_daily_revenue) || 200000;
  // allow per-business target override
  const db = loadDB();
  const biz = (db.businesses||[]).find(b=>b.id===business_id);
  const target = (biz && biz.avg_daily_revenue) || DEFAULT_TARGET;

  // refDate = hari yang dicek (default: kemarin). Jika refDate tidak dikasih, pakai kemarin.
  let ref;
  if(refDate && /^\d{4}-\d{2}-\d{2}$/.test(refDate)) ref = refDate;
  else {
    const d=new Date(); d.setDate(d.getDate()-1);
    ref = ymd(d);
  }

  const day = loadDay(business_id, ref);
  const vsTarget = day.rev - target;
  const vsPct = target ? Math.round(day.rev/target*100) : 0;

  // 3-day streak: berapa hari berturut di bawah target sampai ref (include ref)
  let streakBelow = 0;
  const streakDates=[];
  for(let i=0;i<30;i++){
    const dt=new Date(ref+'T12:00:00'); dt.setDate(dt.getDate()-i);
    const ds=ymd(dt);
    const dy=loadDay(business_id, ds);
    // only count days that have sales OR past days? For KPI, 0 = below target
    if(dy.rev < target) { streakBelow++; streakDates.push(ds); }
    else break;
  }
  const streakWarning = streakBelow >= 3;

  // MTD
  const ym = ref.slice(0,7);
  const from = ym+'-01';
  const dim = daysInMonth(ym);
  const dayNum = parseInt(ref.slice(8,10),10);
  const mtdSales = (db.sales||[]).filter(s=>s.business_id===business_id && s.date>=from && s.date<=ref);
  const mtdRev = mtdSales.reduce((a,b)=>a+b.revenue,0);
  const mtdDaysWithSales = new Set(mtdSales.map(s=>s.date)).size;
  const mtdAvg = mtdDaysWithSales ? Math.round(mtdRev / mtdDaysWithSales) : 0;
  const mtdAvgCalendar = dayNum ? Math.round(mtdRev / dayNum) : 0;
  const projected = Math.round(mtdAvgCalendar * dim);
  const targetMonth = target * dim;
  const needAvgRemaining = dim - dayNum > 0 ? Math.round((targetMonth - mtdRev) / (dim - dayNum)) : 0;

  // margin
  const marginBiz = day.rev ? ((day.netBiz / day.rev)*100) : 0;
  const marginStatus = marginBiz >= 20 ? 'SEHAT' : marginBiz >= 0 ? 'CUKUP' : 'RUGI';

  // topping rate
  const toppingRate = day.rev ? (day.toppingRev / day.rev * 100) : 0;

  // last 7 days trend
  const last7=[];
  for(let i=6;i>=0;i--){
    const dt=new Date(ref+'T12:00:00'); dt.setDate(dt.getDate()-i);
    const ds=ymd(dt);
    const dy=loadDay(business_id, ds);
    last7.push({ date: ds, rev: dy.rev, cups: dy.cups, netBiz: dy.netBiz });
  }

  const alerts=[];
  if(streakWarning) alerts.push(`⚠️ ${streakBelow} hari berturut di bawah target ${target.toLocaleString('id-ID')} — perlu push topping/promo`);
  else if(day.rev < target) alerts.push(`Hari ini kurang ${(target-day.rev).toLocaleString('id-ID')} lagi ke target`);
  if(marginBiz < 0) alerts.push(`Margin usaha minus ${marginBiz.toFixed(1)}% — cek HPP/bahan`);
  else if(marginBiz < 10 && day.rev>0) alerts.push(`Margin tipis ${marginBiz.toFixed(1)}% — topping bisa bantu`);
  if(day.cups===0) alerts.push('Belum ada penjualan — cek stok & posting sosmed');
  if(toppingRate < 10 && day.rev>0) alerts.push(`Topping attach rendah ${toppingRate.toFixed(1)}% — tawarkan keju/oreo +2rb`);
  if(mtdAvgCalendar < target) alerts.push(`MTD rata ${mtdAvgCalendar.toLocaleString('id-ID')}/hari di bawah target — butuh ${needAvgRemaining.toLocaleString('id-ID')}/hari sisa bulan`);

  const health = streakWarning ? 'PERLU PERHATIAN' : day.rev >= target && marginBiz >= 0 ? 'SEHAT' : day.rev===0 ? 'PERLU PERHATIAN' : 'CUKUP';

  return {
    business_id, refDate: ref, ym, target, dim, dayNum,
    day, vsTarget, vsPct,
    streak: { belowCount: streakBelow, warning: streakWarning, dates: streakDates },
    mtd: { from, to: ref, rev: mtdRev, daysWithSales: mtdDaysWithSales, avg: mtdAvg, avgCalendar: mtdAvgCalendar, projected, targetMonth, needAvgRemaining, dim },
    margin: { marginBiz: Number(marginBiz.toFixed(1)), status: marginStatus },
    topping: { toppingRev: day.toppingRev, rate: Number(toppingRate.toFixed(1)) },
    last7,
    alerts,
    health,
    generated_at: new Date().toISOString()
  };
}

module.exports = { buildKpiStatus };
