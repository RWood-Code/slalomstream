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

rem Check for Replit's internal database hostname — not accessible from Windows
echo %DATABASE_URL% | findstr /i "@helium" >nul 2>&1
if not errorlevel 1 (
  echo.
  echo  *** DATABASE CONFIGURATION REQUIRED ***
  echo.
  echo  The database URL in slalomstream.conf points to Replit's
  echo  internal server ("helium") which cannot be reached from
  echo  this computer.
  echo.
  echo  You need a PostgreSQL database that is accessible over the
  echo  internet. The easiest free option is Neon:
  echo.
  echo    1. Go to https://neon.tech and create a free account
  echo    2. Create a new project (choose a region near New Zealand)
  echo    3. Copy the "Connection string" from the dashboard
  echo    4. Open slalomstream.conf in Notepad (in this folder)
  echo    5. Replace the DATABASE_URL= line with your Neon URL
  echo    6. Run SlalomStream again
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
