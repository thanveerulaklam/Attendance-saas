@echo off
REM Run once from a visible console so errors are not lost when double-clicking the .exe.
cd /d "%~dp0"
set "NODE_SKIP_PLATFORM_CHECK=1"
echo Working directory: %CD%
echo.
if exist "%~dp0connector-hik.exe" (
  "%~dp0connector-hik.exe" --once
) else if exist "%~dp0dist\connector-hik.exe" (
  "%~dp0dist\connector-hik.exe" --once
) else (
  echo ERROR: connector-hik.exe not found next to this script or under dist\
  goto :end
)
echo.
echo Exit code: %errorlevel%
echo Check connector-hik.log in this folder.
:end
pause
