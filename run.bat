@echo off
echo Stopping any existing MyCockpit instance...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":7844 "') do (
    taskkill /F /PID %%a 2>nul
)
timeout /t 1 /nobreak >nul
echo Starting MyCockpit...
cd /d "%~dp0"
python main.py
