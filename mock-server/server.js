// Simple Express Mock Server - AI Business OS
// Jalanin: npm install && npm start  -> http://localhost:8000
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 8000;
app.use(cors());
app.use(express.json());

// In-memory store
const db = {
  businesses: [{ id: 'biz_123', org_id: 'org_1', name: 'Brand Fashion A', industry: 'Fashion Retail', products: [{ name: 'Kemeja Linen', price: 170000, cogs: 95000 }], target_market: 'Wanita 25-35 Jabodetabek', business_model: 'D2C', created_at: new Date().toISOString() }],
  workflows: [],
  tasks: [],
  approvals: [],
  reports: []
};
let wfCounter = 1, tskCounter = 1, aprCounter = 1;

const auth = (req, res, next) => {
  // Mock auth - terima apapun Bearer, tapi log
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ') && req.path !== '/api/v1/auth/login' && req.path !== '/api/v1/auth/refresh') {
    // tetap lolos untuk demo, tapi warning
    console.log('[mock-auth] no Bearer, tetap lolos demo untuk', req.path);
  }
  next();
};
app.use('/api/v1', auth);

// Helper
const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
const now = () => new Date().toISOString();

// ---------- Auth ----------
app.post('/api/v1/auth/login', (req, res) => {
  res.json({ access_token: 'mock.jwt.token.' + Date.now(), refresh_token: 'mock_refresh_' + Date.now(), expires_in: 3600, user: { id: 'usr_123', email: req.body.email || 'owner@brand.com', name: 'Budi', role: 'owner' } });
});
app.post('/api/v1/auth/refresh', (req, res) => {
  res.json({ access_token: 'mock.jwt.refreshed.' + Date.now(), expires_in: 3600 });
});
app.get('/api/v1/auth/me', (req, res) => {
  res.json({ id: 'usr_123', email: 'owner@brand.com', name: 'Budi', role: 'owner' });
});

// ---------- Businesses ----------
app.get('/api/v1/businesses', (req, res) => res.json({ data: db.businesses }));
app.post('/api/v1/businesses', (req, res) => {
  const b = { id: uid('biz'), org_id: 'org_1', ...req.body, created_at: now() };
  db.businesses.push(b);
  res.status(201).json(b);
});
app.get('/api/v1/businesses/:id', (req, res) => {
  const b = db.businesses.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  res.json(b);
});
app.patch('/api/v1/businesses/:id', (req, res) => {
  const b = db.businesses.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  Object.assign(b, req.body);
  res.json(b);
});

// ---------- Agents ----------
const AGENTS = [
  { key: 'ceo', name: 'CEO Agent', team: 'executive', status: 'idle', model_tier: 'pro' },
  { key: 'finance_manager', name: 'Finance Manager', team: 'finance', status: 'idle', model_tier: 'pro' },
  { key: 'financial_analyst', name: 'Financial Analyst', team: 'finance', status: 'idle', model_tier: 'mini' },
  { key: 'cashflow_analyst', name: 'Cashflow Analyst', team: 'finance', status: 'idle', model_tier: 'mini' },
  { key: 'forecasting', name: 'Financial Forecasting', team: 'finance', status: 'idle', model_tier: 'mini' },
  { key: 'marketing_manager', name: 'Marketing Manager', team: 'marketing', status: 'idle', model_tier: 'pro' },
  { key: 'performance_marketing', name: 'Performance Marketing', team: 'marketing', status: 'idle', model_tier: 'mini' },
  { key: 'social_media', name: 'Social Media Specialist', team: 'marketing', status: 'idle', model_tier: 'mini' },
  { key: 'copywriter', name: 'Copywriter', team: 'marketing', status: 'idle', model_tier: 'haiku' },
  { key: 'seo', name: 'SEO Specialist', team: 'marketing', status: 'idle', model_tier: 'mini' },
  { key: 'business_strategist', name: 'Business Strategist', team: 'strategy', status: 'idle', model_tier: 'pro' },
  { key: 'market_research', name: 'Market Research', team: 'strategy', status: 'idle', model_tier: 'mini' },
  { key: 'competitor_analyst', name: 'Competitor Analyst', team: 'strategy', status: 'idle', model_tier: 'mini' },
  { key: 'growth', name: 'Growth Strategy', team: 'strategy', status: 'idle', model_tier: 'mini' },
  { key: 'data_analyst', name: 'Data Analyst', team: 'data', status: 'idle', model_tier: 'mini' },
  { key: 'reporting', name: 'Reporting', team: 'data', status: 'idle', model_tier: 'haiku' },
  { key: 'insight', name: 'Insight', team: 'data', status: 'idle', model_tier: 'mini' },
];
app.get('/api/v1/agents', (req, res) => res.json({ data: AGENTS }));

// SSE chat mock
app.post('/api/v1/agents/:key/chat', (req, res) => {
  const { key } = req.params;
  const { message, stream } = req.body;
  if (stream === false) {
    return res.json({ conversation_id: uid('conv'), reply: `Mock reply dari ${key}: "${message}" -> Profit turun 12% karena conversion rate 3.2%->2.1%. Rekomendasi: audit LP campaign terendah.`, confidence: 78 });
  }
  // SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  send('agent_thinking', { agent: key, status: 'Memahami konteks bisnis...' });
  setTimeout(() => send('delegate', { from: 'ceo', to: 'financial_analyst', task_id: uid('tsk') }), 400);
  setTimeout(() => send('delegate', { from: 'ceo', to: 'performance_marketing', task_id: uid('tsk') }), 800);
  const tokens = ['Profit ', 'turun ', '12% ', 'karena ', 'CR ', '3.2% ', '→ ', '2.1%. ', 'Rekomendasi: ', 'audit ', 'LP ', 'dan ', 'cut ', 'campaign ', 'ROAS<2.'];
  let i = 0;
  const interval = setInterval(() => {
    if (i < tokens.length) send('token', { text: tokens[i++] });
    else {
      clearInterval(interval);
      send('done', { conversation_id: uid('conv'), confidence: 78 });
      res.end();
    }
  }, 120);
});

// ---------- Workflows ----------
app.post('/api/v1/workflows', (req, res) => {
  const { business_id, objective, priority } = req.body;
  if (!business_id || !objective) return res.status(400).json({ error: 'business_id & objective required' });
  const wfId = uid('wf');
  const tasks = [
    { id: uid('tsk'), workflow_id: wfId, agent: 'financial_analyst', objective: 'Analisis margin per produk & BEP', priority: 'high', status: 'assigned', dependencies: [], confidence: null, approval_required: null },
    { id: uid('tsk'), workflow_id: wfId, agent: 'performance_marketing', objective: 'Analisis CAC, ROAS, CTR per channel', priority: 'high', status: 'assigned', dependencies: [], confidence: null, approval_required: null },
    { id: uid('tsk'), workflow_id: wfId, agent: 'business_strategist', objective: 'Simulasi pricing & competitor SWOT', priority: 'medium', status: 'pending', dependencies: [], confidence: null, approval_required: null },
    { id: uid('tsk'), workflow_id: wfId, agent: 'data_analyst', objective: 'Validasi KPI & hitung projected impact 5 scenario', priority: 'high', status: 'pending', dependencies: [], confidence: null, approval_required: null },
  ];
  const wf = { workflow_id: wfId, business_id, objective, priority: priority || 'medium', status: 'planning', tasks, requires_approval: true, created_at: now() };
  db.workflows.push(wf);
  db.tasks.push(...tasks);
  // auto approval pending
  const aprId = uid('apr');
  db.approvals.push({ id: aprId, task_id: tasks[0].id, workflow_id: wfId, level: 'level2', status: 'pending', requested_by: 'ceo_agent', decided_by: null, reason: null, requested_at: now(), objective });
  wf.approval_id = aprId;
  res.status(201).json(wf);
});
app.get('/api/v1/workflows', (req, res) => {
  const { business_id, status } = req.query;
  let data = db.workflows;
  if (business_id) data = data.filter(w => w.business_id === business_id);
  if (status) data = data.filter(w => w.status === status);
  res.json({ data });
});
app.get('/api/v1/workflows/:id', (req, res) => {
  const w = db.workflows.find(x => x.workflow_id === req.params.id);
  if (!w) return res.status(404).json({ error: 'not_found' });
  res.json(w);
});
app.post('/api/v1/workflows/:id/approve', (req, res) => {
  const w = db.workflows.find(x => x.workflow_id === req.params.id);
  if (!w) return res.status(404).json({ error: 'not_found' });
  w.status = req.body.decision === 'approved' ? 'working' : 'planning';
  w.approval_decision = req.body;
  // update related approval
  const apr = db.approvals.find(a => a.workflow_id === w.workflow_id && a.status === 'pending');
  if (apr) { apr.status = req.body.decision; apr.decided_by = 'usr_123'; apr.reason = req.body.reason; }
  res.json({ ok: true, workflow: w });
});

// ---------- Tasks ----------
app.post('/api/v1/tasks', (req, res) => {
  const t = { id: uid('tsk'), status: 'assigned', confidence: null, approval_required: null, ...req.body, created_at: now() };
  db.tasks.push(t);
  res.status(201).json(t);
});
app.get('/api/v1/tasks', (req, res) => {
  let data = db.tasks;
  if (req.query.workflow_id) data = data.filter(t => t.workflow_id === req.query.workflow_id);
  if (req.query.agent) data = data.filter(t => t.agent === req.query.agent);
  if (req.query.status) data = data.filter(t => t.status === req.query.status);
  res.json({ data });
});
app.get('/api/v1/tasks/:id', (req, res) => {
  const t = db.tasks.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not_found' });
  res.json(t);
});
app.patch('/api/v1/tasks/:id', (req, res) => {
  const t = db.tasks.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not_found' });
  Object.assign(t, req.body);
  res.json(t);
});

// ---------- Finance ----------
app.get('/api/v1/finance/cashflow', (req, res) => {
  res.json({ cash_balance: 180000000, burn_rate: 42000000, runway_days: 42, forecast_13w: Array.from({ length: 13 }, (_, i) => ({ week: i + 1, inflow: 60000000 + i * 1000000, outflow: 55000000 })), alert: 'warning' });
});
app.post('/api/v1/finance/analysis', (req, res) => {
  res.json({ revenue: 250000000, cogs: 140000000, gross_profit: 110000000, gross_margin: 0.44, net_profit: 42000000, net_margin: 0.168, bep: 185000000, per_product: [{ product: 'Kemeja Linen', revenue: 150000000, cogs: 85000000, margin: 0.43 }], cac: 32000, ltv: 280000, confidence: 82, sources: ['sheets:biz_123:2026-Q1'] });
});
app.post('/api/v1/finance/forecast', (req, res) => {
  res.json({
    base: [{ month: '2026-10', revenue: 270000000, profit: 48000000 }, { month: '2026-11', revenue: 285000000, profit: 52000000 }, { month: '2026-12', revenue: 300000000, profit: 58000000 }],
    best: [{ month: '2026-10', revenue: 310000000, profit: 62000000 }],
    worst: [{ month: '2026-10', revenue: 230000000, profit: 32000000 }],
    assumptions: ['CAC tetap 32rb', 'No price change'], confidence: 71
  });
});
app.get('/api/v1/finance/transactions', (req, res) => res.json({ data: [{ id: uid('txn'), type: 'revenue', amount: 15000000, category: 'sales', occurred_at: now(), source: 'sheets' }] }));
app.post('/api/v1/finance/transactions', (req, res) => res.status(201).json({ ok: true, imported: (req.body.transactions || []).length }));

// ---------- Marketing ----------
app.post('/api/v1/marketing/campaigns', (req, res) => {
  res.status(201).json({ campaign_id: uid('cmp'), structure: { objective: req.body.objective, budget: req.body.budget }, allocation: { meta: Math.round(req.body.budget * 0.5), google: Math.round(req.body.budget * 0.3), tiktok: Math.round(req.body.budget * 0.2) }, kpi: { CAC_target: 35000, ROAS_target: 3.5 }, requires_approval: true });
});
app.get('/api/v1/marketing/campaigns', (req, res) => res.json({ data: [{ id: uid('cmp'), name: 'Campaign Ramadan', status: 'running', budget: 10000000 }] }));
app.get('/api/v1/marketing/campaigns/:id', (req, res) => res.json({ id: req.params.id, name: 'Campaign Detail Mock', status: 'running' }));
app.post('/api/v1/marketing/content', (req, res) => res.status(201).json({ calendar: [{ date: '2026-10-01', platform: 'instagram', type: 'reels', idea: 'Behind the scene kemeja linen' }, { date: '2026-10-02', platform: 'tiktok', type: 'carousel', idea: 'Mix & match 3 style' }] }));
app.post('/api/v1/marketing/copy/generate', (req, res) => res.json({ variants: [{ headline: 'Nyaman Seharian Pakai Linen Premium', body: 'AIDA: Attention - Gerah pakai kemeja tebal? Interest - Linen breathable...', cta: 'Beli Sekarang - Free Ongkir' }, { headline: 'Kemeja Linen Anti Gerah', body: 'PAS: Problem gerah... Agitate... Solution linen...', cta: 'Cek Koleksi' }] }));
app.post('/api/v1/marketing/seo/keywords', (req, res) => res.json({ clusters: [{ cluster: 'kemeja linen pria', keywords: ['kemeja linen pria', 'kemeja linen cowok', 'kemeja linen premium'], intent: 'transactional' }], roadmap: [{ week: 1, topic: 'Cara merawat kemeja linen', priority: 'high' }] }));

// ---------- Strategy ----------
app.get('/api/v1/strategy/competitors', (req, res) => res.json({ competitors: [{ name: 'Brand X', price: 165000, positioning: 'murah' }], swot: { strengths: ['margin tinggi'], weaknesses: ['reach kecil'] } }));
app.post('/api/v1/strategy/competitors', (req, res) => res.status(201).json({ task_id: uid('tsk'), agent: 'competitor_analyst', status: 'assigned' }));
app.post('/api/v1/strategy/market-research', (req, res) => res.json({ tam: 1200000000000, sam: 180000000000, som: 25000000000, label: 'ESTIMATION', confidence: 58 }));

// ---------- KPI & Metrics ----------
app.get('/api/v1/kpis', (req, res) => res.json({ data: [{ id: 'kpi_rev', name: 'Revenue', category: 'business', target: 300000000, unit: 'IDR' }, { id: 'kpi_roas', name: 'ROAS', category: 'marketing', target: 3.5, unit: 'ratio' }] }));
app.get('/api/v1/metrics', (req, res) => res.json({ data: [{ id: uid('met'), kpi: req.query.kpi || 'revenue', value: 250000000, period_start: '2026-09-01T00:00:00+07:00', period_end: '2026-09-30T23:59:59+07:00', source: 'sheets' }] }));
app.post('/api/v1/metrics/import', (req, res) => res.status(201).json({ ok: true, imported: (req.body.metrics || []).length }));

// ---------- Reports ----------
app.post('/api/v1/reports/generate', (req, res) => {
  const r = { id: uid('rpt'), business_id: req.body.business_id, type: req.body.type, period: req.body.period, payload: { summary: 'Revenue 250jt, profit 42jt', data: {}, insight: 'ROAS turun', problems: ['CR turun'], opportunities: ['Produk A margin 42%'], recommendations: [{ text: 'Cut campaign ROAS<2', confidence: 78 }], action_plan: [{ task: 'Pause losers', owner: 'performance_marketing' }] }, generated_by: 'reporting_agent', created_at: now() };
  db.reports.push(r);
  res.status(201).json(r);
});
app.get('/api/v1/reports', (req, res) => {
  let data = db.reports;
  if (req.query.business_id) data = data.filter(r => r.business_id === req.query.business_id);
  if (req.query.type) data = data.filter(r => r.type === req.query.type);
  res.json({ data });
});
app.get('/api/v1/reports/:id', (req, res) => {
  const r = db.reports.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json(r);
});

// ---------- Memory ----------
app.get('/api/v1/memories', (req, res) => res.json({ data: [{ id: uid('mem'), business_id: req.query.business_id, type: req.query.type || 'decision', key: 'dec_2026_09', value: { decision: 'Naikkan harga 15->17rb', rationale: 'Margin +12%', confidence: 78 }, version: 1, created_at: now() }] }));
app.post('/api/v1/memories', (req, res) => res.status(201).json({ id: uid('mem'), ...req.body, version: 1, created_at: now() }));
app.get('/api/v1/memories/:id', (req, res) => res.json({ id: req.params.id, type: 'business', key: 'pricing', value: {} }));

// ---------- Integrations ----------
app.get('/api/v1/integrations', (req, res) => res.json({ data: [{ id: uid('int'), provider: 'sheets', status: 'connected', last_sync_at: now(), sync_freq: '6h' }, { id: uid('int'), provider: 'meta_ads', status: 'connected', last_sync_at: now(), sync_freq: '1h' }] }));
app.post('/api/v1/integrations/:provider/connect', (req, res) => res.json({ id: uid('int'), provider: req.params.provider, status: 'connected', last_sync_at: now(), sync_freq: '1h' }));
app.post('/api/v1/integrations/:provider/sync', (req, res) => res.json({ synced_records: 42, last_sync_at: now() }));

// ---------- Approvals ----------
app.get('/api/v1/approvals', (req, res) => {
  let data = db.approvals;
  if (req.query.status) data = data.filter(a => a.status === req.query.status);
  res.json({ data });
});
app.post('/api/v1/approvals/:id/decide', (req, res) => {
  const a = db.approvals.find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'not_found', hint: 'coba GET /approvals?status=pending untuk cari id valid' });
  a.status = req.body.decision; a.decided_by = 'usr_123'; a.reason = req.body.reason; a.decided_at = now();
  const wf = db.workflows.find(w => w.workflow_id === a.workflow_id);
  if (wf) wf.status = req.body.decision === 'approved' ? 'working' : 'planning';
  res.json(a);
});

// ---------- Dashboard ----------
app.get('/api/v1/dashboard/overview', (req, res) => {
  res.json({
    health_score: 72,
    health_breakdown: { financial: 80, marketing: 60, growth: 70, operational: 75, customer: 65 },
    kpis: { revenue: 250000000, expense: 208000000, profit: 42000000, cashflow: 180000000, cac: 32000, roas: 3.2, conversion_rate: 0.021, growth: 0.12 },
    insights: [
      { type: 'opportunity', text: 'Produk A margin 42% growth 18% → push ads', confidence: 82 },
      { type: 'warning', text: 'Spend +24% revenue +5% → ROAS drop 3.8→2.9', confidence: 91 },
      { type: 'critical', text: 'Cashflow negatif dalam 21 hari jika burn tetap', confidence: 76 }
    ],
    active_tasks: db.tasks.slice(0, 5),
    alerts: [{ type: 'financial', text: 'Runway 42 hari', level: 'warning' }]
  });
});

// Root
app.get('/', (req, res) => res.json({ ok: true, service: 'AI Business OS Mock Server', docs: 'Import openapi_AI_Business_OS.yaml ke Swagger, atau pakai Postman collection', health: now() }));

app.listen(PORT, () => {
  console.log(`✅ Mock Server jalan di http://localhost:${PORT}`);
  console.log(`   Coba: curl http://localhost:${PORT}/api/v1/dashboard/overview?business_id=biz_123`);
  console.log(`   Swagger: import C:/Users/Marketing Catra/openapi_AI_Business_OS.yaml ke https://editor.swagger.io`);
  console.log(`   Postman: import C:/Users/Marketing Catra/postman_AI_Business_OS.json lalu set baseUrl=http://localhost:${PORT}/api/v1`);
});
