@echo off
cd /d "%~dp0"

echo.
echo  ===================================================
echo    SlalomStream - Tournament Management System
echo  ===================================================
echo.

rem Read configuration from slalomstream.conf
for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0slalomstream.conf") do (
  if /i "%%a"=="PORT" set PORT=%%b
)

if not defined PORT set PORT=3000

rem Database stored locally — no internet required
rem PGlite (PostgreSQL compiled to WebAssembly) runs inside Node.js
set DB_DATA_DIR=%~dp0data
set SERVE_STATIC=true
set STATIC_DIR=%~dp0artifacts\slalom-stream\dist\public
set NODE_ENV=production

echo  Starting on port %PORT%...
echo.
echo  Judges and scoreboard: open a browser on any device connected
echo  to the same WiFi network and go to:
echo.
echo    http://(this-computer-IP):%PORT%
echo.
echo  On this computer: http://localhost:%PORT%
echo.
echo  Press Ctrl+C to stop the server.
echo.

:loop
"%~dp0node.exe" "%~dp0artifacts\api-server\dist\index.cjs"
set EXIT_CODE=%errorlevel%

if %EXIT_CODE%==42 (
  echo.
  echo  [SlalomStream] Update applied - restarting...
  timeout /t 2 >nul
  goto loop
)

echo.
echo  [SlalomStream] Server stopped (exit code: %EXIT_CODE%).
pause
