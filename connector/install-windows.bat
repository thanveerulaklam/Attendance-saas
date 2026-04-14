@echo off
setlocal EnableDelayedExpansion
REM Run this ONCE as Administrator.
REM Resolves connector.exe next to this script OR under dist\ (matches npm run build:win).
REM config.json must sit in the SAME folder as the .exe (connector reads it from there).

cd /d "%~dp0"
set "SCRIPT_DIR=%~dp0"
set "LOG_FILE=%SCRIPT_DIR%install-log.txt"
set "CONNECTOR_EXE="
set "CONNECTOR_DIR="

echo %date% %time% - Install started >> "%LOG_FILE%"

REM Check for Administrator (required for schtasks /ru SYSTEM)
net session >nul 2>&1
if %errorlevel% neq 0 goto :not_admin

echo %date% %time% - Running as Administrator >> "%LOG_FILE%"
echo Installing Attendance Connector to run at Windows startup...

set "TASK_NAME=AttendanceConnector"

REM Prefer exe next to this script, then dist\ (common after npm run build:win).
REM pkg multi-target: connector-win.exe; single-target: connector.exe
if exist "%SCRIPT_DIR%connector-win.exe" set "CONNECTOR_EXE=%SCRIPT_DIR%connector-win.exe"
if not defined CONNECTOR_EXE if exist "%SCRIPT_DIR%connector.exe" set "CONNECTOR_EXE=%SCRIPT_DIR%connector.exe"
if not defined CONNECTOR_EXE if exist "%SCRIPT_DIR%dist\connector-win.exe" set "CONNECTOR_EXE=%SCRIPT_DIR%dist\connector-win.exe"
if not defined CONNECTOR_EXE if exist "%SCRIPT_DIR%dist\connector.exe" set "CONNECTOR_EXE=%SCRIPT_DIR%dist\connector.exe"

if not defined CONNECTOR_EXE (
    echo %date% %time% - ERROR: no connector exe found >> "%LOG_FILE%"
    echo ERROR: No connector executable found.
    echo Put this .bat in the same folder as connector.exe ^(or connector-win.exe^),
    echo   or run from the connector project root so dist\connector.exe exists.
    echo Build on Windows: cd connector ^&^& npm install ^&^& npm run build:win
    goto :pause_section
)

REM Config lives next to the .exe (see index.js: appDir = folder of the executable).
for %%F in ("%CONNECTOR_EXE%") do set "CONNECTOR_DIR=%%~dpF"
echo %date% %time% - Connector binary: %CONNECTOR_EXE% >> "%LOG_FILE%"
echo %date% %time% - Config directory ^(must contain config.json^): %CONNECTOR_DIR% >> "%LOG_FILE%"

if not exist "%CONNECTOR_DIR%config.json" (
    echo %date% %time% - config.json missing; trying template copy >> "%LOG_FILE%"
    if exist "%CONNECTOR_DIR%config.example.json" (
        copy /Y "%CONNECTOR_DIR%config.example.json" "%CONNECTOR_DIR%config.json" >> "%LOG_FILE%" 2>&1
    ) else if exist "%SCRIPT_DIR%config.example.json" (
        copy /Y "%SCRIPT_DIR%config.example.json" "%CONNECTOR_DIR%config.json" >> "%LOG_FILE%" 2>&1
    ) else if exist "%SCRIPT_DIR%config.example.two-devices.json" (
        echo Copying multi-device template config.example.two-devices.json -^> config.json
        copy /Y "%SCRIPT_DIR%config.example.two-devices.json" "%CONNECTOR_DIR%config.json" >> "%LOG_FILE%" 2>&1
    )
)

if not exist "%CONNECTOR_DIR%config.json" (
    echo %date% %time% - ERROR: config.json not found >> "%LOG_FILE%"
    echo ERROR: config.json not found in:
    echo   %CONNECTOR_DIR%
    echo Copy config.example.json to config.json in that folder, or copy from the project zip.
    echo Two devices on the LAN: use the pattern in config.example.two-devices.json
    goto :pause_section
)

echo %date% %time% - config.json found >> "%LOG_FILE%"
echo Using connector: %CONNECTOR_EXE%
echo Using config:   %CONNECTOR_DIR%config.json
echo.

REM Node 18 (inside packaged exe) blocks Windows 7 unless this is set.
echo %date% %time% - Setting NODE_SKIP_PLATFORM_CHECK=1 (machine) for older Windows >> "%LOG_FILE%"
setx NODE_SKIP_PLATFORM_CHECK 1 /M >> "%LOG_FILE%" 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v NODE_SKIP_PLATFORM_CHECK /t REG_SZ /d 1 /f >> "%LOG_FILE%" 2>&1

REM Remove existing task if any
echo %date% %time% - Deleting old task if any >> "%LOG_FILE%"
schtasks /delete /tn "%TASK_NAME%" /f 2>nul

REM Create task: run at SYSTEM startup, as LOCAL SYSTEM
echo %date% %time% - Creating scheduled task >> "%LOG_FILE%"
REM Run the 64-bit .exe directly (no cmd.exe / .bat). On Windows 7, Task Scheduler often starts .bat via
REM 32-bit WOW64 cmd, which then fails to start this 64-bit exe with exit code 216 (ERROR_EXE_MACHINE_TYPE_MISMATCH).
REM Config path is derived from the exe location in index.js, so working directory is not required.
schtasks /create /tn "%TASK_NAME%" /tr "\"%CONNECTOR_EXE%\"" /sc onstart /ru SYSTEM /f >> "%LOG_FILE%" 2>>&1

if errorlevel 1 goto :task_failed
goto :task_ok

:task_ok
echo %date% %time% - SUCCESS: Task created. Connector will start at Windows startup. >> "%LOG_FILE%"
echo.
echo SUCCESS: Connector will start automatically when Windows starts.
echo Log file: %CONNECTOR_DIR%connector.log
echo Installer log: %LOG_FILE% ^(this folder^)
echo.
echo If the .exe is under dist\, keep config.json in dist\ next to it ^(same folder as the .exe^).
echo Windows 7: NODE_SKIP_PLATFORM_CHECK was set machine-wide. Reboot once so the scheduled task ^(SYSTEM^) always sees it.
echo For auto-restart after crashes, point a scheduled task or shortcut to run-windows.bat ^(not required for normal use^).
echo.
echo Starting the connector now...
schtasks /run /tn "%TASK_NAME%" >> "%LOG_FILE%" 2>&1
timeout /t 5 /nobreak >nul
echo.
echo If you don't see connector.log after a few seconds, open Task Scheduler and check "%TASK_NAME%".
goto :pause_section

:task_failed
echo %date% %time% - FAILED: schtasks /create failed. Run as Administrator. >> "%LOG_FILE%"
echo.
echo FAILED. You must run this as Administrator: right-click install-windows.bat -^> Run as administrator
goto :pause_section

:not_admin
echo %date% %time% - Not run as Administrator >> "%LOG_FILE%"
echo.
echo *** This installer must run as Administrator. ***
echo.
echo Right-click install-windows.bat and choose "Run as administrator".
echo Do not double-click it.
echo.
set /p RELAUNCH="Re-launch as Administrator now? (Y/N): "
if /i "!RELAUNCH!"=="Y" (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit
)
echo.
goto :pause_section

:pause_section
echo.
echo ========================================
echo Press any key to close this window...
echo ========================================
echo Full installer trace: %LOG_FILE%
pause >nul
exit /b 0
