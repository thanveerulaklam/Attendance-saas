@echo off
REM Wrapper: runs connector.exe and restarts if it crashes (for use with Task Scheduler)
cd /d "%~dp0"

:loop
if exist connector.exe (
    connector.exe
) else (
    node index.js
)
echo [%date% %time%] Connector exited. Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
