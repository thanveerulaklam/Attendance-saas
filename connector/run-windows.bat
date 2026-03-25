@echo off
REM Wrapper: runs packaged connector and restarts if it crashes (for use with Task Scheduler)
REM Order: pkg multi-target (connector-win.exe), single-target build (connector.exe), dev (node).
cd /d "%~dp0"

:loop
if exist connector-win.exe (
    connector-win.exe
) else if exist connector.exe (
    connector.exe
) else (
    node index.js
)
echo [%date% %time%] Connector exited. Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
