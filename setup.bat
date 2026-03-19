@echo off
title MyCockpit Setup
echo.
echo  ====================================================
echo   MyCockpit Setup
echo  ====================================================
echo.

:: Verify Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not found.
    echo  Install Python 3.11+ from https://www.python.org/downloads/
    echo  Make sure to check "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)

:: Run the Python setup script
cd /d "%~dp0"
python setup.py
echo.
pause
