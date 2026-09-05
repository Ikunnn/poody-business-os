@echo off
REM Share Poody ke tim - 1 klik, tanpa install
REM Butuh Node.js saja. Link muncul di terminal -> copy ke tim.
echo === Poody Share (localtunnel) ===
echo Port 8001 (Dashboard) ...
echo Jika diminta password di browser, isi IP yang tampil di terminal.
echo.
npx --yes localtunnel --port 8001
