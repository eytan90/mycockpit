@echo off
chcp 65001 > nul
cd /d "%~dp0"
set PYTHONUTF8=1

:: Kill any existing instance on port 7844
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":7844 "') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

python main.py
