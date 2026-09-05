# Poody Business OS — Deploy ke Render Free (Langkah 1-klik)

## Cara biar tim bisa buka luas (URL tetap)

### 1) Push ke Github (sekali)
```bat
cd "C:\Users\Marketing Catra"
git init
git add .
git commit -m "Poody Business OS - ready for Render"
# buat repo baru di github.com/new -> nama: poody-business-os -> copy URL
git remote add origin https://github.com/USERNAME/poody-business-os.git
git branch -M main
git push -u origin main
```

### 2) Deploy di Render (5 menit)
1. Buka https://dashboard.render.com -> New -> Blueprint -> Connect repo poody-business-os
2. Render baca render.yaml otomatis
3. Isi env: GEMINI_API_KEY (dari aistudio.google.com) -> Deploy
4. Tunggu ~3 menit -> dapat URL: https://poody-business-os.onrender.com

### 3) Share ke tim
Tim buka: https://poody-business-os.onrender.com
- Login gak perlu (mode UMKM anon), langsung Kasir + Dashboard
- Sleep: kalau 15 menit gak ada yang buka, load pertama ~30 detik (normal free tier)

### Catatan Render Free
- Free gak minta kartu, 750 jam/bulan
- Tanpa disk: data db.json reset tiap deploy ulang. Mitigasi:
  - Export Excel tiap tutup harian (tombol Excel), atau
  - Nanti migrasi ke Postgres free (Neon) biar permanen — bilang aja "migrasi Postgres" nanti gue ubah
- Backup hourly lokal tetap jalan di PC lu (C:\Users\Marketing Catra\backups)

### Alternatif tanpa Github
- Render -> New -> Web Service -> Public Git URL -> paste link Github (setelah push)

### Test lokal sebelum push
```
npx pm2 list
curl http://localhost:8001/health  -> OK
```
