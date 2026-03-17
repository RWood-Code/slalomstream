@echo off
cd /d "%~dp0"

rem ── SlalomStream Launcher ─────────────────────────────────────────────────────
rem Double-click this to start SlalomStream and open it in your browser.

rem Read PORT from slalomstream.conf
set PORT=3000
for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0slalomstream.conf") do (
  if /i "%%a"=="PORT" set PORT=%%b
)

echo.
echo  ===================================================
echo    SlalomStream - Tournament Management System
echo  ===================================================
echo.
echo  Starting the SlalomStream server...

rem Open the server in a separate window
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
echo  Opening your browser in 5 seconds...
echo.
timeout /t 5 /nobreak >nul

start "" "http://localhost:%PORT%"

echo  Browser opened to: http://localhost:%PORT%
echo.
echo  You can close this window now.
timeout /t 3 /nobreak >nul
exit /b 0
