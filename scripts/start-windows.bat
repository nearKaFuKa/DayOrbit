@echo off
rem Start DayOrbit local server (minimized) and open the app in browser.
cd /d "%~dp0.."
where pythonw >nul 2>nul
if %errorlevel%==0 (
  start "DayOrbit-server" /min pythonw src\workbench-server.py
) else (
  start "DayOrbit-server" /min python src\workbench-server.py
)
timeout /t 1 >nul
start "" "http://127.0.0.1:8765/"
