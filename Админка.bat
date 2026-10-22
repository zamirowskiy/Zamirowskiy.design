@echo off
chcp 65001 >nul
title Portfolio admin
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8

where python >nul 2>nul
if errorlevel 1 (
  echo Python not found. Install it from python.org and run again.
  pause
  exit /b 1
)

rem Server runs in background (no black window) and keeps working until
rem you press the "off" button in the admin menu or restart the PC.
where pythonw >nul 2>nul
if errorlevel 1 (
  start "" /min python tools\admin.py
) else (
  start "" pythonw tools\admin.py
)

rem Check that it really started; if not, show the error in this window.
timeout /t 3 /nobreak >nul
curl -s -o nul --noproxy "*" http://127.0.0.1:8777/admin/
if errorlevel 1 (
  echo.
  echo Admin did not start. Error output below:
  echo.
  python tools\admin.py
  pause
)
