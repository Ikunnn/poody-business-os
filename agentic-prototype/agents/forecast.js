// Forecast B3 — 7d omset MA + trend linear, stock velocity per catering, 3-hari rugi alert
const { loadDB } = require('./storage');

function ymd(d){ return d.toISOString().slice(0,10); }
function addDays(s,n){ const d=new Date(s+'T12:00:00'); d.setDate(d.getDate()+n); return ymd(d); }
function rupiah(n){ return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n); }

function buildDailySeries(business_id, daysBack=30){
  const db=loadDB();
  const today=ymd(new Date());
  const end=today; // today, but sales up to today-1 usually
  // collect all sales grouped
  const byRev={}, byCups={}, byExpBiz={}, byNetBiz={};
  const sales=(db.sales||[]).filter(s=>s.business_id===business_id);
  const exps=(db.expenses||[]).filter(e=>e.business_id===business_id && (e.category||'').toLowerCase()!=='pribadi');
  const salesByDate={}; const expByDate={};
  for(const s of sales){ if(!salesByDate[s.date]) salesByDate[s.date]={rev:0,cups:0,profit:0}; salesByDate[s.date].rev+=s.revenue; salesByDate[s.date].cups+=s.total_cups; salesByDate[s.date].profit+=s.profit; }
  for(const e of exps){ expByDate[e.date]=(expByDate[e.date]||0)+e.amount; }
  // last N days ending yesterday (exclude today which may be partial)
  const dates=[];
  for(let i=daysBack-1;i>=0;i--){
    const d=addDays(today,-i);
    // skip future? ensure <= today
    if(d>today) continue;
    dates.push(d);
  }
  const series=dates.map(d=>{
    const r=salesByDate[d]||{rev:0,cups:0,profit:0};
    const exp=expByDate[d]||0;
    return { date:d, rev:r.rev, cups:r.cups, profit:r.profit, expBiz:exp, netBiz: r.profit - exp };
  });
  return series;
}
function linearForecast(values, nAhead=7){
  // regression on last 14 days, but if many zeros (awal bulan kosong), use last 14 with rev>0
  let y=values.slice(-14).map(v=>v.rev);
  const nz=y.filter(v=>v>0);
  if(nz.length>=7 && y.filter(v=>v===0).length>=5){
    // banyak bolong Sep awal -> pakai 14 hari terakhir yg ada omset
    const revs=values.filter(v=>v.rev>0).slice(-14).map(v=>v.rev);
    if(revs.length>=5) y=revs;
  }
  // if too few, use MA
  if(y.length<5){
    const avg=y.length? y.reduce((a,b)=>a+b,0)/y.length : 0;
    return Array(nAhead).fill(Math.round(avg));
  }
  const n=y.length;
  const x=y.map((_,i)=>i);
  const sumX=x.reduce((a,b)=>a+b,0), sumY=y.reduce((a,b)=>a+b,0);
  const sumXY=x.reduce((a,xi,i)=>a+xi*y[i],0), sumX2=x.reduce((a,xi)=>a+xi*xi,0);
  const denom=(n*sumX2 - sumX*sumX);
  let slope=0, intercept=sumY/n;
  if(denom!==0){
    slope=(n*sumXY - sumX*sumY)/denom;
    intercept=(sumY - slope*sumX)/n;
  }
  // clamp slope moderate
  if(slope < -50000) slope=-50000;
  if(slope > 50000) slope=50000;
  const lastX=n-1;
  const out=[];
  for(let i=1;i<=nAhead;i++){
    let v=Math.round(intercept + slope*(lastX+i));
    if(v<0) v=0;
    // also bound by MA +- 60%
    const avg=sumY/n;
    v=Math.max(Math.round(avg*0.4), Math.min(Math.round(avg*1.6), v));
    out.push(v);
  }
  return out;
}
function movingAvg(series, w=7){
  const vals=series.slice(-w).map(s=>s.rev);
  // if >40% zeros, avg on non-zero
  const nz=vals.filter(v=>v>0);
  const use = nz.length>=w*0.5 ? nz : vals;
  const avg= use.length? use.reduce((a,b)=>a+b,0)/use.length : 0;
  return Math.round(avg);
}
function buildForecast(business_id){
  const series=buildDailySeries(business_id, 30);
  // filter out future today zero? keep as is for MA but forecast uses last 14 days
  const ma7=movingAvg(series,7);
  const ma14=movingAvg(series,14);
  const target=200000;
  const last7=series.slice(-7);
  const lastRevAvg= last7.length? last7.reduce((a,b)=>a+b.rev,0)/last7.length : 0;
  const trend = ma7 - ma14;
  const trendLabel = trend>15000 ? 'naik' : trend<-15000 ? 'turun' : 'stabil';
  const nextVals=linearForecast(series,7);
  const dates=[];
  const today=ymd(new Date());
  for(let i=1;i<=7;i++) dates.push(addDays(today,i));
  const forecast=dates.map((d,i)=> ({ date:d, rev: nextVals[i], revFmt: rupiah(nextVals[i]), cups: Math.round(nextVals[i]/11000), vsTarget: nextVals[i]>=target? 'lewat':'kurang' }));
  const totalForecast=nextVals.reduce((a,b)=>a+b,0);
  // streak rugi 3 hari
  const recent=series.slice(-10); // check last 10 days ending yesterday-ish
  let streak=0, maxStreak=0, alertDays=[];
  for(const s of recent.slice(-7)){
    if(s.netBiz<0) { streak++; alertDays.push(s.date); } else streak=0;
    maxStreak=Math.max(maxStreak, streak);
  }
  // check 3 consecutive
  let threeStreak=false;
  for(let i=0;i<recent.length-2;i++){
    if(recent[i].netBiz<0 && recent[i+1].netBiz<0 && recent[i+2].netBiz<0){ threeStreak=true; break; }
  }
  const alerts=[];
  if(threeStreak) alerts.push({ type:'crit', title:'Rugi usaha 3 hari berturut', detail:`Cek ${recent.filter(s=>s.netBiz<0).slice(-3).map(s=>s.date).join(', ')} — kontrol bahan/ambil pribadi.` });
  // also single big loss
  const bigLoss=recent.filter(s=>s.netBiz < -300000);
  if(bigLoss.length) alerts.push({ type:'warn', title:`${bigLoss.length} hari rugi besar (>300rb)`, detail: bigLoss.map(s=> `${s.date} ${rupiah(s.netBiz)}`).join(' • ') });
  // stock velocity: avg cups per day last 7/14 vs stock assumption
  const avgCups7= last7.reduce((a,b)=>a+b.cups,0)/Math.max(1,last7.filter(s=>s.cups>0).length||7);
  const avgCups14= series.slice(-14).reduce((a,b)=>a+b.cups,0)/Math.max(1,series.slice(-14).filter(s=>s.cups>0).length||14);
  // Suggest stock 7d = avg *7
  const need7=Math.ceil(avgCups7*7);
  const need14=Math.ceil(avgCups14*14);
  const stock = { avgCups7: Math.round(avgCups7), avgCups14: Math.round(avgCups14), need7, need14, note: `Rata ${Math.round(avgCups7)} cup/hari (7d) → butuh ~${need7} cup stok mingguan. Jika stok <${Math.ceil(need7*0.6)} cup, restock.` };
  return { series: series.slice(-14), forecast, ma7, ma14, trend, trendLabel, totalForecast, avgCups7: Math.round(avgCups7), stock, alerts, threeStreak, maxStreak, generated_at:new Date().toISOString() };
}
module.exports={ buildDailySeries, buildForecast, rupiah };
