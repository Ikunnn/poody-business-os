# Poody — Deploy & Share (D2)

## Opsi cepat (pilih 1)

### A) Share lokal 1-klik — tanpa install (paling cocok untuk tim UMKM)
1. Jalankan: `npx --yes localtunnel --port 8001`
2. Copy URL `https://xxxx.loca.lt` yang muncul -> share ke tim
3. Tim buka URL itu — langsung lihat dashboard Poody
   Catatan: kalau diminta password di loca.lt, isi IP yang tampil di terminal.

Alternatif jika localtunnel lambat:
- `ssh -R 80:localhost:8001 nokey@localhost.run`  (Serveo, tanpa install)
- `npx --yes localtunnel --port 8000` untuk mock OpenAPI

### B) LAN (tanpa internet) — tim di WiFi yang sama
```bat
ipconfig  -> cari IPv4, mis 192.168.1.15
# tim buka: http://192.168.1.15:8001
```

### C) Cloud permanen (recommended untuk produksi)
- Railway / Render / Fly.io — push repo + set env
- Dockerfile sudah ada: `Dockerfile` (node 22, pm2-free)
- Env wajib: GEMINI_API_KEY, JWT_SECRET, PORT
- Data: `data/db.json` pakai volume (Railway Volume / Render Disk)

## File di repo
- ecosystem.config.js — PM2 2 apps (8000 mock + 8001 poody)
- C:/Users/Marketing Catra/logs/ — log pm2
- C:/Users/Marketing Catra/backups/ — backup hourly via cron
- scripts/share_poody.bat — launcher tunnel

## PM2
```
npx pm2 list
npx pm2 logs poody-prototype
npx pm2 restart poody-prototype
npx pm2 save
```

## Backup
- Cron `Poody DB backup hourly` (d597e9d4c6bc) setiap jam -> C:/Users/Marketing Catra/backups/
- Restore: copy file backup terbaru ke data/db.json lalu `npx pm2 restart poody-prototype`

## Keamanan share link
- Link tunnel public = siapa pun bisa buka. Untuk private: pakai Cloudflare Tunnel dengan auth, atau deploy ke Railway dengan Basic Auth.
- Jangan share .env — pakai .env.example sebagai template.
