@echo off
setlocal EnableDelayedExpansion
REM Matrix COSEC connector — run ONCE as Administrator.
REM Put connector-cosec.exe and config.cosec.json in the SAME folder as this script (or under dist\).

cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"
set "LOG_FILE=%SCRIPT_DIR%install-log.txt"
set "CONNECTOR_EXE="
set "CONNECTOR_DIR="

echo %date% %time% - Matrix COSEC install started >> "%LOG_FILE%"

net session >nul 2>&1
if %errorlevel% neq 0 goto :not_admin

echo Installing Matrix COSEC Connector to run at Windows startup...
set "TASK_NAME=AttendanceConnectorCOSEC"

if exist "%SCRIPT_DIR%connector-cosec.exe" set "CONNECTOR_EXE=%SCRIPT_DIR%connector-cosec.exe"
if not defined CONNECTOR_EXE if exist "%SCRIPT_DIR%dist\connector-cosec.exe" set "CONNECTOR_EXE=%SCRIPT_DIR%dist\connector-cosec.exe"

if not defined CONNECTOR_EXE (
    echo ERROR: connector-cosec.exe not found.
    echo Build: cd connector\matrix ^&^& npm install ^&^& npm run build:win
    echo Or copy connector-cosec.exe into this folder.
    goto :pause_section
)

for %%F in ("%CONNECTOR_EXE%") do set "CONNECTOR_DIR=%%~dpF"

if not exist "%CONNECTOR_DIR%config.cosec.json" (
    if exist "%CONNECTOR_DIR%config.example.cosec.json" (
        copy /Y "%CONNECTOR_DIR%config.example.cosec.json" "%CONNECTOR_DIR%config.cosec.json"
    ) else if exist "%SCRIPT_DIR%config.example.cosec.json" (
        copy /Y "%SCRIPT_DIR%config.example.cosec.json" "%CONNECTOR_DIR%config.cosec.json"
    )
)

if not exist "%CONNECTOR_DIR%config.cosec.json" (
    echo ERROR: config.cosec.json not found in %CONNECTOR_DIR%
    echo Copy config.example.cosec.json to config.cosec.json and fill in device IP, credentials, API key.
    goto :pause_section
)

echo Using connector: %CONNECTOR_EXE%
echo Using config:   %CONNECTOR_DIR%config.cosec.json

setx NODE_SKIP_PLATFORM_CHECK 1 /M >> "%LOG_FILE%" 2>&1
schtasks /delete /tn "%TASK_NAME%" /f 2>nul
schtasks /create /tn "%TASK_NAME%" /tr "\"%CONNECTOR_EXE%\"" /sc onstart /ru SYSTEM /f >> "%LOG_FILE%" 2>&1

if errorlevel 1 goto :task_failed

echo SUCCESS: Matrix COSEC connector will start when Windows starts.
echo Log: %CONNECTOR_DIR%connector-cosec.log
schtasks /run /tn "%TASK_NAME%" >> "%LOG_FILE%" 2>&1
goto :pause_section

:task_failed
echo FAILED: Run this script as Administrator.

:not_admin
echo Right-click install-windows.bat -^> Run as administrator

:pause_section
echo.
pause
exit /b 0
