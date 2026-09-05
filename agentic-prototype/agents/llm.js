// LLM Router: OpenAI (jika ada credit) -> Gemini (free tier) -> MOCK fallback
// Prioritas: 1) OpenAI (jika .env punya OPENAI_API_KEY dan masih ada credit) 2) Gemini (GEMINI_API_KEY) 3) Mock
// Gemini free: buat key di https://aistudio.google.com/app/apikey -> taruh di .env GEMINI_API_KEY=...
const prompts = require('./prompts');
let provider = 'MOCK';
let modelName = 'mock';
let openai = null;
let genAI = null;
let geminiModel = null;

try {
  require('dotenv').config();
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  if (hasOpenAI) {
    try {
      const OpenAI = require('openai');
      openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      if (!hasGemini) {
        provider = 'OPENAI';
        modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        console.log(`[LLM] Provider=OPENAI model=${modelName}`);
      }
    } catch (e) { console.log('[LLM] openai init fail', e.message); }
  }

  if (hasGemini) {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      geminiModel = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.6-flash' });
      // Jika OpenAI juga ada tapi fallback diperlukan, Gemini jadi backup
      if (provider === 'MOCK') {
        provider = 'GEMINI';
        modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
        console.log(`[LLM] Provider=GEMINI model=${modelName} (free tier)`);
      } else {
        console.log(`[LLM] Gemini backup ready model=${process.env.GEMINI_MODEL || 'gemini-3.6-flash'} (fallback jika OpenAI 429)`);
      }
    } catch (e) { console.log('[LLM] gemini init fail', e.message); }
  }

  if (provider === 'MOCK' && !hasGemini && !hasOpenAI) {
    console.log('[LLM] No API key -> MOCK mode. Isi GEMINI_API_KEY (free) di .env untuk LLM real gratis.');
  }
} catch (e) {
  console.log('[LLM] init error', e.message);
}

function mockCEO(userMessage) {
  return JSON.stringify({
    understanding: `Objective: "${userMessage.slice(0,120)}" - MOCK (isi GEMINI_API_KEY di .env untuk LLM real gratis)`,
    tasks: [
      { agent: 'financial_analyst', objective: 'Analisis margin per produk & BEP', priority: 'high', requires_approval: false },
      { agent: 'performance_marketing', objective: 'Analisis CAC/ROAS per channel', priority: 'high', requires_approval: false },
      { agent: 'business_strategist', objective: 'Simulasi pricing & competitor', priority: 'medium', requires_approval: true },
    ],
    next_data_needed: ['revenue 3 bulan', 'HPP per produk', 'spend ads'],
    confidence: 62,
    note: 'MOCK - tambah GEMINI_API_KEY di .env (aistudio.google.com, gratis)',
  }, null, 2);
}

async function callGemini(agentKey, userMessage, opts = {}) {
  const system = prompts[agentKey] || prompts.ceo;
  // Vision: if opts has image (base64), use inlineData
  if (opts.imageBase64) {
    const imagePart = { inlineData: { data: opts.imageBase64, mimeType: opts.imageMime || 'image/jpeg' } };
    const prompt = `${system}\n\nUser: ${userMessage}`;
    const result = await geminiModel.generateContent([prompt, imagePart]);
    return result.response.text();
  }
  const result = await geminiModel.generateContent(`${system}\n\nUser: ${userMessage}`);
  return result.response.text();
}

async function callOpenAI(agentKey, userMessage, opts = {}) {
  const system = prompts[agentKey] || prompts.ceo;
  const responseFormat = opts.json ? { type: 'json_object' } : undefined;
  const completion = await openai.chat.completions.create({
    model: modelName,
    messages: [{ role: 'system', content: system }, { role: 'user', content: userMessage }],
    temperature: 0.7,
    max_tokens: opts.maxTokens || 1200,
    ...(responseFormat ? { response_format: responseFormat } : {}),
  });
  return completion.choices[0].message.content;
}

async function callLLM(agentKey, userMessage, opts = {}) {
  // Jika provider GEMINI -> langsung Gemini
  if (provider === 'GEMINI') {
    try {
      return await callGemini(agentKey, userMessage, opts);
    } catch (e) {
      console.log('[LLM] Gemini error, fallback MOCK:', e.message);
      return agentKey === 'ceo' ? mockCEO(userMessage) : `[MOCK ${agentKey}] Gemini error: ${e.message}`;
    }
  }

  // Jika provider OPENAI -> coba OpenAI, fallback ke Gemini jika 429
  if (provider === 'OPENAI') {
    try {
      // Vision for OpenAI
      if (opts.imageBase64 && openai) {
        const system = prompts[agentKey] || prompts.ceo;
        const completion = await openai.chat.completions.create({
          model: modelName,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: [{ type: 'text', text: userMessage }, { type: 'image_url', image_url: { url: `data:${opts.imageMime || 'image/jpeg'};base64,${opts.imageBase64}` } }] }
          ],
          max_tokens: opts.maxTokens || 800,
        });
        return completion.choices[0].message.content;
      }
      return await callOpenAI(agentKey, userMessage, opts);
    } catch (e) {
      const isQuota = e.status === 429 || (e.message && (e.message.includes('credits') || e.message.includes('quota')));
      if (isQuota && genAI && geminiModel) {
        console.log('[LLM] OpenAI 429 -> fallback GEMINI');
        provider = 'GEMINI'; // switch permanen untuk session ini
        modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
        return await callGemini(agentKey, userMessage, opts);
      }
      if (isQuota) {
        console.log('[LLM] OpenAI 429 no Gemini backup -> MOCK');
        return agentKey === 'ceo' ? mockCEO(userMessage).replace('MOCK (isi', 'FALLBACK MOCK (saldo habis, isi GEMINI_API_KEY gratis untuk LLM real) - ') : `[FALLBACK MOCK ${agentKey}] ${userMessage.slice(0,60)}`;
      }
      throw e;
    }
  }

  // MOCK
  await new Promise(r => setTimeout(r, 300));
  if (agentKey === 'ceo') return mockCEO(userMessage);
  return `[MOCK ${agentKey}] Respon untuk: "${userMessage.slice(0,80)}". Isi GEMINI_API_KEY di .env untuk LLM real gratis.`;
}

module.exports = { callLLM, isMock: () => provider === 'MOCK', model: () => `${provider}:${modelName}`, provider: () => provider };
