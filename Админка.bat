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
python tools\admin.py
if errorlevel 1 pause
