@echo off
cd /d "%~dp0"

echo.
echo  ===================================================
echo    SlalomStream - Tournament Management System
echo  ===================================================
echo.

rem Read configuration from slalomstream.conf
for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0slalomstream.conf") do (
  if /i "%%a"=="DATABASE_URL" set DATABASE_URL=%%b
  if /i "%%a"=="PORT" set PORT=%%b
)

if not defined PORT set PORT=3000

if not defined DATABASE_URL (
  echo ERROR: DATABASE_URL is not configured.
  echo.
  echo Open slalomstream.conf in the installation folder and set your
  echo PostgreSQL connection string, then run this again.
  echo.
  pause
  exit /b 1
)

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
