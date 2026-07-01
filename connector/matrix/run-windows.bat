@echo off
setlocal
cd /d "%~dp0"
set "NODE_SKIP_PLATFORM_CHECK=1"
set "LOG_FILE=%~dp0connector-cosec.log"

:loop
if exist connector-cosec.exe goto :run_exe
if exist dist\connector-cosec.exe goto :run_dist
if exist node_modules goto :run_node
echo ERROR: connector-cosec.exe not found. Run npm run build:win or copy the exe here.
pause
exit /b 1

:run_exe
connector-cosec.exe
goto :wait

:run_dist
dist\connector-cosec.exe
goto :wait

:run_node
node cosec-connector.js
goto :wait

:wait
timeout /t 10 /nobreak >nul
goto loop
