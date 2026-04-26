@echo off
cd /d "%~dp0"

rem ── SlalomStream Launcher ─────────────────────────────────────────────────────
rem Double-click this to start SlalomStream and open it in your browser.
rem If the server is already running this will just open the browser.

rem Read PORT from slalomstream.conf
set PORT=3000
for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0slalomstream.conf") do (
  if /i "%%a"=="PORT" set PORT=%%b
)

rem ── Check if the server is already running on this port ─────────────────────
netstat -an 2>nul | findstr /r ":%PORT% .*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo.
  echo  ===================================================
  echo    SlalomStream is already running on port %PORT%
  echo  ===================================================
  echo.
  echo  Opening browser...
  echo.
  start "" "http://localhost:%PORT%"
  timeout /t 2 >nul
  exit /b 0
)

rem ── Server is not running — start it ─────────────────────────────────────────
echo.
echo  ===================================================
echo    SlalomStream - Tournament Management System
echo  ===================================================
echo.
echo  Starting the SlalomStream server...

start "SlalomStream Server" "%~dp0SlalomStream.bat"

echo.
echo  *** PLEASE READ ***
echo.
echo  SlalomStream is a web-based application.
echo  It will open automatically in your web browser.
echo.
echo  - The web browser tab IS the application.
echo  - Keep this window and the server window open
echo    while you are running a tournament.
echo  - Other devices (judges, scoreboard) connect by
echo    opening a browser and going to:
echo    http://[this computer's IP address]:%PORT%
echo.
echo  Opening your browser in 4 seconds...
echo.
timeout /t 4 /nobreak >nul

start "" "http://localhost:%PORT%"

echo  Browser opened to: http://localhost:%PORT%
echo.
echo  You can close this window now.
timeout /t 2 >nul
exit /b 0
