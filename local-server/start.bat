@echo off
echo.
echo ========================================
echo   Mill Entry System
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js install nahi hai!
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

:: Auto install if needed
if not exist node_modules (
    echo Dependencies install ho rahe hain...
    call npm install
    echo.
)

:: Auto build frontend if public/ missing
if not exist public\index.html (
    echo Frontend build nahi mila - setup chal raha hai...
    echo.
    node setup.js
    if %errorlevel% neq 0 (
        echo [ERROR] Setup fail hua!
        pause
        exit /b 1
    )
    echo.
)

echo Server start ho raha hai...
echo.
echo   URL: http://localhost:8080
echo   Login: admin / admin123
echo.
echo   Band karne ke liye: Ctrl+C ya ye window band karein
echo ========================================
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server start nahi hua!
    echo Port 8080 busy hai? server.js mein PORT change karein
)
pause
