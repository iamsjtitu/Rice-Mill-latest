@echo off
echo ========================================
echo   Mill Entry System - Starting...
echo ========================================
echo.

:: Check if public folder exists
if not exist public (
    echo [ERROR] Frontend build nahi mila!
    echo Pehle "setup.bat" chalayein.
    pause
    exit /b 1
)

:: Check if node_modules exists
if not exist node_modules (
    echo [INFO] Dependencies install ho rahe hain...
    call npm install
)

echo Server start ho raha hai...
echo Browser mein http://localhost:8080 khulega
echo.
echo Band karne ke liye: Ctrl+C dabayein
echo ========================================
node server.js
pause
