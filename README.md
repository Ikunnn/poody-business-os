# Poody Business OS — Agentic AI untuk UMKM

Silky Pudding 6 rasa x 2 size (M 5100/10000, L 6100/12000) + 7 topping (2rb-3rb). Target 200rb/hari.

## Run lokal
```bash
npm --prefix agentic-prototype install
node agentic-prototype/server.js
# buka http://localhost:8001
```

Mock OpenAPI: `node mock-server/server.js` -> http://localhost:8000

## Deploy Render Free (tanpa kartu)
1. Push repo ini ke GitHub
2. Render dashboard -> New -> Blueprint -> connect repo -> auto baca render.yaml
3. Set env GEMINI_API_KEY (aistudio.google.com) -> Deploy
4. URL tetap: https://poody-business-os.onrender.com

## Env
Lihat agentic-prototype/.env.example

## Stack
Node 22, Express, Gemini 3.6-flash, PM2, RAG keyword, KPI/Briefing/Forecast.
