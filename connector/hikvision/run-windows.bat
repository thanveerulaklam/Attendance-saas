@echo off
setlocal
REM Restarts connector-hik.exe if it exits (optional watchdog).
cd /d "%~dp0"
set "NODE_SKIP_PLATFORM_CHECK=1"
set "LOG_FILE=%~dp0connector-hik.log"

:loop
if exist "%~dp0connector-hik.exe" (
    echo [%date% %time%] run-windows.bat: starting connector-hik.exe >> "%LOG_FILE%"
    "%~dp0connector-hik.exe"
) else if exist "%~dp0dist\connector-hik.exe" (
    echo [%date% %time%] run-windows.bat: starting dist\connector-hik.exe >> "%LOG_FILE%"
    "%~dp0dist\connector-hik.exe"
) else (
    echo [%date% %time%] run-windows.bat: starting node hikvision-connector.js >> "%LOG_FILE%"
    node "%~dp0hikvision-connector.js"
)
set "EXITCODE=%errorlevel%"
echo [%date% %time%] exited %EXITCODE%, restart in 10s >> "%LOG_FILE%"
timeout /t 10 /nobreak >nul
goto loop
