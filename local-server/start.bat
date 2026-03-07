@echo off
echo ========================================
echo   Mill Entry System
echo ========================================
echo.

:: Check if node_modules exists
if not exist node_modules (
    echo [INFO] Pehli baar chal raha hai - dependencies install ho rahe hain...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install fail hua! Node.js install hai?
        echo Download: https://nodejs.org/
        pause
        exit /b 1
    )
)

:: Check if public folder exists
if not exist public\index.html (
    echo [ERROR] Frontend build nahi mila (public folder)!
    echo Pehle "setup.bat" chalayein ya GitHub se code dobara download karein.
    pause
    exit /b 1
)

echo Server start ho raha hai...
echo Browser mein http://localhost:8080 khulega
echo.
echo Band karne ke liye ye window band kar dein ya Ctrl+C dabayein
echo ========================================
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server start nahi hua!
    echo Kya port 8080 kisi aur app ne use kiya hai?
    pause
)
