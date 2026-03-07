@echo off
REM Run this ONCE as Administrator to make the connector start automatically with Windows.
REM Put this file in the SAME folder as connector.exe and config.json.

echo Installing Attendance Connector to run at Windows startup...

set "CONNECTOR_DIR=%~dp0"
set "CONNECTOR_EXE=%CONNECTOR_DIR%connector.exe"
set "RUN_SCRIPT=%CONNECTOR_DIR%run-windows.bat"
set "TASK_NAME=AttendanceConnector"

if not exist "%CONNECTOR_EXE%" (
    echo ERROR: connector.exe not found in %CONNECTOR_DIR%
    echo Build it first: cd connector && npm run build:win
    pause
    exit /b 1
)

if not exist "%CONNECTOR_DIR%config.json" (
    echo ERROR: config.json not found. Copy config.example.json to config.json and fill in your values.
    pause
    exit /b 1
)

REM Remove existing task if any
schtasks /delete /tn "%TASK_NAME%" /f 2>nul

REM Create task: run at system startup (when PC boots); run-windows.bat does "cd /d %~dp0" so it uses the connector folder
REM Use "Run whether user is logged on or not" in task Properties so it runs at boot without anyone logging in
schtasks /create /tn "%TASK_NAME%" /tr "\"%RUN_SCRIPT%\"" /sc onstart /rl highest /f

if %errorlevel% equ 0 (
    echo.
    echo SUCCESS: Connector will start automatically when Windows starts.
    echo Log file: %CONNECTOR_DIR%connector.log
    echo.
    echo To run it now: double-click connector.exe or run "schtasks /run /tn AttendanceConnector"
) else (
    echo.
    echo FAILED. Try running this as Administrator: right-click -^> Run as administrator
)

pause
