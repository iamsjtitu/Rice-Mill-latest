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
    pause
    exit /b 1
)

echo [1/3] Node.js dependencies install ho rahe hain...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install fail hua!
    pause
    exit /b 1
)

echo.
echo [2/3] Frontend build ho raha hai...
cd ..\frontend
call npm install
set REACT_APP_BACKEND_URL=http://localhost:8080
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build fail hua!
    pause
    exit /b 1
)

echo.
echo [3/3] Frontend build copy ho raha hai...
cd ..\local-server
if exist public rmdir /s /q public
xcopy /E /I /Q ..\frontend\build public

echo.
echo ========================================
echo   Setup Complete!
echo   Ab "start.bat" double-click karein
echo ========================================
pause
