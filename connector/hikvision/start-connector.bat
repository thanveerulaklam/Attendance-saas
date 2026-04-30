@echo off
REM Double-click helper: sets NODE_SKIP_PLATFORM_CHECK for packaged Node on older Windows.
cd /d "%~dp0"
set "NODE_SKIP_PLATFORM_CHECK=1"
if exist "%~dp0connector-hik.exe" (
    "%~dp0connector-hik.exe"
    exit /b %errorlevel%
)
if exist "%~dp0dist\connector-hik.exe" (
    "%~dp0dist\connector-hik.exe"
    exit /b %errorlevel%
)
echo ERROR: connector-hik.exe not found. Build: npm run build:win
pause
exit /b 1
