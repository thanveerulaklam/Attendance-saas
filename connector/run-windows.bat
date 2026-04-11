@echo off
setlocal
REM Wrapper: runs packaged connector and restarts if it crashes (for use with Task Scheduler)
REM Order: pkg multi-target (connector-win.exe), single-target build (connector.exe), dev (node).
REM Use GOTO branches (not "else if") so parsing is reliable on older Windows (e.g. Windows 7).
cd /d "%~dp0"

REM Node 18+ blocks Windows 7 unless this is set. pkg bundles Node 18, so the .exe needs it too.
set "NODE_SKIP_PLATFORM_CHECK=1"

set "LOG_FILE=%~dp0connector.log"

:loop
if exist connector-win.exe goto :run_win
if exist connector.exe goto :run_single
goto :run_node

:run_win
echo [%date% %time%] run-windows.bat: starting connector-win.exe (cwd=%CD%) >> "%LOG_FILE%"
connector-win.exe
set "EXITCODE=%errorlevel%"
echo [%date% %time%] run-windows.bat: connector-win.exe exited with code %EXITCODE%. Restarting in 10 seconds... >> "%LOG_FILE%"
goto :wait

:run_single
echo [%date% %time%] run-windows.bat: starting connector.exe (cwd=%CD%) >> "%LOG_FILE%"
connector.exe
set "EXITCODE=%errorlevel%"
echo [%date% %time%] run-windows.bat: connector.exe exited with code %EXITCODE%. Restarting in 10 seconds... >> "%LOG_FILE%"
goto :wait

:run_node
echo [%date% %time%] run-windows.bat: starting dev mode (node index.js) (cwd=%CD%) >> "%LOG_FILE%"
node index.js
set "EXITCODE=%errorlevel%"
echo [%date% %time%] run-windows.bat: node index.js exited with code %EXITCODE%. Restarting in 10 seconds... >> "%LOG_FILE%"

:wait
timeout /t 10 /nobreak >nul
goto loop
