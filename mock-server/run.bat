@echo off
echo Install & jalankan mock server...
cd /d "%~dp0"
npm install
echo.
echo Menyalankan server di http://localhost:8000
echo Coba: curl http://localhost:8000/api/v1/dashboard/overview?business_id=biz_123
echo Stop: Ctrl+C
node server.js
