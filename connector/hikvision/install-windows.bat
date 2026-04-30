@echo off
setlocal EnableDelayedExpansion
REM Run this ONCE as Administrator.
REM connector-hik.exe must be in this folder (or dist\). config.hikvision.json must be next to the .exe.

cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"
set "LOG_FILE=%SCRIPT_DIR%install-hik-log.txt"
set "CONNECTOR_EXE="
set "CONNECTOR_DIR="

echo %date% %time% - Hikvision install started >> "%LOG_FILE%"

net session >nul 2>&1
if %errorlevel% neq 0 goto :not_admin

echo %date% %time% - Running as Administrator >> "%LOG_FILE%"
echo Installing Hikvision Attendance Connector to run at Windows startup...

set "TASK_NAME=AttendanceConnectorHik"

if exist "%SCRIPT_DIR%connector-hik.exe" set "CONNECTOR_EXE=%SCRIPT_DIR%connector-hik.exe"
if not defined CONNECTOR_EXE if exist "%SCRIPT_DIR%dist\connector-hik.exe" set "CONNECTOR_EXE=%SCRIPT_DIR%dist\connector-hik.exe"

if not defined CONNECTOR_EXE (
    echo %date% %time% - ERROR: connector-hik.exe not found >> "%LOG_FILE%"
    echo ERROR: connector-hik.exe not found.
    echo Put install-windows.bat in the same folder as connector-hik.exe
    echo   or build first: cd connector\hikvision ^&^& npm install ^&^& npm run build:win
    goto :pause_section
)

for %%F in ("%CONNECTOR_EXE%") do set "CONNECTOR_DIR=%%~dpF"
echo %date% %time% - Binary: %CONNECTOR_EXE% >> "%LOG_FILE%"
echo %date% %time% - Config dir: %CONNECTOR_DIR% >> "%LOG_FILE%"

if not exist "%CONNECTOR_DIR%config.hikvision.json" (
    echo %date% %time% - config.hikvision.json missing; copying template >> "%LOG_FILE%"
    if exist "%CONNECTOR_DIR%config.example.hikvision.json" (
        copy /Y "%CONNECTOR_DIR%config.example.hikvision.json" "%CONNECTOR_DIR%config.hikvision.json" >> "%LOG_FILE%" 2>&1
    ) else if exist "%SCRIPT_DIR%config.example.hikvision.json" (
        copy /Y "%SCRIPT_DIR%config.example.hikvision.json" "%CONNECTOR_DIR%config.hikvision.json" >> "%LOG_FILE%" 2>&1
    )
)

if not exist "%CONNECTOR_DIR%config.hikvision.json" (
    echo %date% %time% - ERROR: config.hikvision.json not found >> "%LOG_FILE%"
    echo ERROR: config.hikvision.json not found in:
    echo   %CONNECTOR_DIR%
    echo Copy config.example.hikvision.json to config.hikvision.json and edit deviceIp, credentials, deviceApiKey.
    goto :pause_section
)

echo %date% %time% - config.hikvision.json found >> "%LOG_FILE%"
echo Using: %CONNECTOR_EXE%
echo Config: %CONNECTOR_DIR%config.hikvision.json
echo.

setx NODE_SKIP_PLATFORM_CHECK 1 /M >> "%LOG_FILE%" 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v NODE_SKIP_PLATFORM_CHECK /t REG_SZ /d 1 /f >> "%LOG_FILE%" 2>&1

schtasks /delete /tn "%TASK_NAME%" /f 2>nul

echo %date% %time% - Creating scheduled task %TASK_NAME% >> "%LOG_FILE%"
schtasks /create /tn "%TASK_NAME%" /tr "\"%CONNECTOR_EXE%\"" /sc onstart /ru SYSTEM /f >> "%LOG_FILE%" 2>>&1

if errorlevel 1 goto :task_failed

echo %date% %time% - SUCCESS >> "%LOG_FILE%"
echo.
echo SUCCESS: Hikvision connector will start when Windows starts.
echo Log: %CONNECTOR_DIR%connector-hik.log
echo Installer log: %LOG_FILE%
echo Task Scheduler name: %TASK_NAME%
echo.
echo Starting connector now...
schtasks /run /tn "%TASK_NAME%" >> "%LOG_FILE%" 2>&1
timeout /t 5 /nobreak >nul
goto :pause_section

:task_failed
echo %date% %time% - schtasks failed >> "%LOG_FILE%"
echo FAILED. Run this batch as Administrator.
goto :pause_section

:not_admin
echo %date% %time% - Not admin >> "%LOG_FILE%"
echo *** Run as Administrator: right-click install-windows.bat -^> Run as administrator ***
set /p RELAUNCH="Re-launch as Administrator? (Y/N): "
if /i "!RELAUNCH!"=="Y" (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit
)
goto :pause_section

:pause_section
echo.
echo Press any key to close...
pause >nul
exit /b 0
