@echo off
REM Wrapper: runs packaged connector and restarts if it crashes (for use with Task Scheduler)
REM Order: pkg multi-target (connector-win.exe), single-target build (connector.exe), dev (node).
cd /d "%~dp0"

set "LOG_FILE=%~dp0connector.log"

:loop
if exist connector-win.exe (
    echo [%date% %time%] run-windows.bat: starting connector-win.exe (cwd=%CD%) >> "%LOG_FILE%"
    connector-win.exe
) else if exist connector.exe (
    echo [%date% %time%] run-windows.bat: starting connector.exe (cwd=%CD%) >> "%LOG_FILE%"
    connector.exe
) else (
    echo [%date% %time%] run-windows.bat: starting dev mode (node index.js) (cwd=%CD%) >> "%LOG_FILE%"
    node index.js
)
echo [%date% %time%] Connector exited. Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
