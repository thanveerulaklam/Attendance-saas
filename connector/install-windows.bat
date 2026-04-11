@echo off
setlocal EnableDelayedExpansion
REM Run this ONCE as Administrator. Put this file in the SAME folder as the connector binary and config.json.
REM After `npm run build`: use connector-win.exe (multi-target). Older builds: connector.exe.

REM Always use the folder where this script lives (Run as admin can start in System32)
cd /d "%~dp0"
set "CONNECTOR_DIR=%~dp0"
set "LOG_FILE=%CONNECTOR_DIR%install-log.txt"

echo %date% %time% - Install started >> "%LOG_FILE%"

REM Check for Administrator (required for schtasks /ru SYSTEM)
net session >nul 2>&1
if %errorlevel% neq 0 goto :not_admin

echo %date% %time% - Running as Administrator >> "%LOG_FILE%"
echo Installing Attendance Connector to run at Windows startup...

set "TASK_NAME=AttendanceConnector"

REM pkg multi-target `npm run build` -> connector-win.exe; single-target `build:win` -> connector.exe
set "CONNECTOR_EXE="
if exist "%CONNECTOR_DIR%connector-win.exe" set "CONNECTOR_EXE=%CONNECTOR_DIR%connector-win.exe"
if not defined CONNECTOR_EXE if exist "%CONNECTOR_DIR%connector.exe" set "CONNECTOR_EXE=%CONNECTOR_DIR%connector.exe"

if not defined CONNECTOR_EXE (
    echo %date% %time% - ERROR: connector-win.exe or connector.exe not found >> "%LOG_FILE%"
    echo ERROR: connector-win.exe or connector.exe not found in %CONNECTOR_DIR%
    goto :pause_section
)

echo %date% %time% - Connector binary found: %CONNECTOR_EXE% >> "%LOG_FILE%"

if not exist "%CONNECTOR_DIR%config.json" (
    echo %date% %time% - ERROR: config.json not found >> "%LOG_FILE%"
    echo ERROR: config.json not found. Copy config.example.json to config.json and fill in your values.
    goto :pause_section
)

echo %date% %time% - config.json found >> "%LOG_FILE%"

REM Node 18 (inside connector-win.exe) blocks Windows 7 unless this is set.
echo %date% %time% - Setting NODE_SKIP_PLATFORM_CHECK=1 (machine) for older Windows >> "%LOG_FILE%"
setx NODE_SKIP_PLATFORM_CHECK 1 /M >> "%LOG_FILE%" 2>&1
REM SYSTEM account reads this key; setx alone sometimes needs a reboot before new scheduled runs see it.
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v NODE_SKIP_PLATFORM_CHECK /t REG_SZ /d 1 /f >> "%LOG_FILE%" 2>&1

REM Remove existing task if any
echo %date% %time% - Deleting old task if any >> "%LOG_FILE%"
schtasks /delete /tn "%TASK_NAME%" /f 2>nul

REM Create task: run at SYSTEM startup, as LOCAL SYSTEM
echo %date% %time% - Creating scheduled task >> "%LOG_FILE%"
REM Run the 64-bit .exe directly (no cmd.exe / .bat). On Windows 7, Task Scheduler often starts .bat via
REM 32-bit WOW64 cmd, which then fails to start this 64-bit exe with exit code 216 (ERROR_EXE_MACHINE_TYPE_MISMATCH).
REM Config path is derived from the exe location in index.js, so working directory is not required.
echo %date% %time% - Scheduled task runs: "%CONNECTOR_EXE%" >> "%LOG_FILE%"
REM Quote the exe path for schtasks (required if the folder path contains spaces, e.g. Program Files).
schtasks /create /tn "%TASK_NAME%" /tr "\"%CONNECTOR_EXE%\"" /sc onstart /ru SYSTEM /f >> "%LOG_FILE%" 2>>&1

REM Check result immediately (next command overwrites errorlevel)
if errorlevel 1 goto :task_failed
goto :task_ok

:task_ok
echo %date% %time% - SUCCESS: Task created. Connector will start at Windows startup. >> "%LOG_FILE%"
echo.
echo SUCCESS: Connector will start automatically when Windows starts.
echo Log file: %CONNECTOR_DIR%connector.log
echo.
echo Windows 7: NODE_SKIP_PLATFORM_CHECK was set machine-wide. Reboot once so the scheduled task ^(SYSTEM^) always sees it.
echo For auto-restart after crashes, use run-windows.bat from a shortcut ^(not the scheduled task^).
echo.
echo Starting the connector now...
schtasks /run /tn "%TASK_NAME%" >> "%LOG_FILE%" 2>>&1
timeout /t 5 /nobreak >nul
echo.
echo If you don't see connector.log after a few seconds, open Task Scheduler and check "AttendanceConnector".
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
echo Result was written to install-log.txt
pause >nul
exit /b 0
