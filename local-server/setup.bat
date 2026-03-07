@echo off
echo ========================================
echo   Mill Entry System - Setup
echo ========================================
echo.

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js install nahi hai!
    echo Download karein: https://nodejs.org/
    echo LTS version install karein.
    pause
    exit /b 1
)

echo [1/2] Node.js version check...
node --version
echo.

echo [2/2] Dependencies install ho rahe hain...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install fail hua!
    pause
    exit /b 1
)

:: Check if public folder exists (pre-built frontend)
if exist public\index.html (
    echo.
    echo [OK] Frontend build already available hai (public folder mein)
) else (
    echo.
    echo [WARNING] Frontend build nahi mila!
    echo.
    echo Agar "frontend" folder hai to ye command chalayein:
    echo   cd ..\frontend
    echo   npm install
    echo   set REACT_APP_BACKEND_URL=http://localhost:8080
    echo   npm run build
    echo   xcopy /E /I /Q build ..\local-server\public
    echo.
    echo Ya phir GitHub se code dobara download karein -
    echo "public" folder included hona chahiye.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Setup Complete!
echo   Ab "start.bat" double-click karein
echo ========================================
echo.
pause
