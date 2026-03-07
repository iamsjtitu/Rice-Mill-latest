@echo off
echo.
echo ========================================
echo   Mill Entry System - Setup
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js install nahi hai!
    echo.
    echo Download karein: https://nodejs.org/
    echo LTS version install karein (green button)
    echo.
    pause
    exit /b 1
)

echo Node.js found: 
node --version
echo.

node setup.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Setup fail hua!
    echo.
)
pause
