@echo off
REM Use this to start the connector on Windows 7 (or if double-clicking connector-win.exe shows the Node "not supported" error).
REM Double-clicking the .exe alone does NOT set NODE_SKIP_PLATFORM_CHECK; this script does.
cd /d "%~dp0"
set "NODE_SKIP_PLATFORM_CHECK=1"
if exist connector-win.exe goto :run_win
if exist connector.exe goto :run_single
echo ERROR: connector-win.exe or connector.exe not found in %CD%
pause
exit /b 1

:run_win
connector-win.exe
set "EC=%errorlevel%"
exit /b %EC%

:run_single
connector.exe
set "EC=%errorlevel%"
exit /b %EC%
