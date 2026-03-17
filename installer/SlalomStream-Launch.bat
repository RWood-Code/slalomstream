@echo off
cd /d "%~dp0"

rem ── SlalomStream Launcher ─────────────────────────────────────────────────────
rem Double-click this to start SlalomStream and open it in your browser.
rem The server window will open separately — keep it running while using the app.

rem Read PORT from slalomstream.conf
set PORT=3000
for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0slalomstream.conf") do (
  if /i "%%a"=="PORT" set PORT=%%b
)

echo.
echo  ===================================================
echo    SlalomStream - Starting up...
echo  ===================================================
echo.
echo  Starting server...

rem Open the server in a separate window (user can see errors / close it to stop)
start "SlalomStream Server" "%~dp0SlalomStream.bat"

echo  Waiting for server to be ready...
timeout /t 4 /nobreak >nul

echo  Opening SlalomStream in your browser...
echo.
echo  If the page shows an error, wait a moment and press F5 to refresh.
echo.

start "" "http://localhost:%PORT%"

rem This launcher window can now close
timeout /t 2 /nobreak >nul
exit /b 0
