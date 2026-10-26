@echo off
:: NeuroSync — Complete Full-Stack Startup Script (Windows)
:: Starts integrated backend+frontend (port 3000) and ML sidecar (port 8000)
:: Usage: double-click start.bat OR run from terminal

cd /d "%~dp0"
title NeuroSync Full Stack

:: ── Add WinGet ffmpeg to PATH if installed ────────────────────────────────
set "WINGET_LINKS=%LOCALAPPDATA%\Microsoft\WinGet\Links"
if exist "%WINGET_LINKS%\ffmpeg.exe" (
    set "PATH=%PATH%;%WINGET_LINKS%"
)

:: ── Verify .env exists ────────────────────────────────────────────────────
if not exist ".env" (
    echo [ERROR] .env file not found.
    echo Copy .env.example to .env and fill in your GROQ_API_KEY.
    echo.
    pause
    exit /b 1
)

:: ── Verify root node_modules ──────────────────────────────────────────────
if not exist "node_modules" (
    echo [SETUP] Installing backend dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

:: ── Verify ML dependencies ────────────────────────────────────────────────
echo [SETUP] Verifying ML dependencies...
py -m pip show librosa >nul 2>&1
if errorlevel 1 (
    echo [SETUP] Installing ML dependencies from requirements.txt...
    py -m pip install -r ml/requirements.txt -q
    if errorlevel 1 (
        echo [WARNING] ML dependency installation had issues, but continuing...
    )
)

:: ── Display startup banner ────────────────────────────────────────────────
cls
echo.
echo ════════════════════════════════════════════════════════════════════════
echo                    NeuroSync Full Stack Starting
echo ════════════════════════════════════════════════════════════════════════
echo.
echo [1/2] Starting Main Server (Backend + Frontend) on port 3000...
echo [2/2] Starting ML Sidecar on port 8000...
echo.

:: ── Start Full Stack (Backend + Frontend integrated on port 3000 + ML on port 8000) ────
echo [START] Launching Main Server (Backend + Frontend) on http://localhost:3000
start "NeuroSync Server" /min cmd /c "cd /d ""%~dp0"" && echo Starting NeuroSync (Backend + Frontend)... && set PORT=3000 && npm run dev"

:: ── Start ML Sidecar (FastAPI) in a new window ───────────────────────────
echo [START] Launching ML Sidecar on http://localhost:8000
start "NeuroSync ML Sidecar" /min cmd /c "cd /d ""%~dp0"" && echo Starting ML Sidecar... && py -m uvicorn main:app --app-dir ml --host 0.0.0.0 --port 8000"

:: Wait for services to boot
echo.
echo [WAIT] Giving services 8 seconds to start...
timeout /t 8 /nobreak >nul

:: ── Display access information ────────────────────────────────────────────
cls
echo.
echo ════════════════════════════════════════════════════════════════════════
echo                    NeuroSync Full Stack Running ✓
echo ════════════════════════════════════════════════════════════════════════
echo.
echo App:       http://localhost:3000
echo           (Includes Backend API + Vite Frontend + HMR)
echo.
echo ML Sidecar: http://localhost:8000
echo           (Behavior Interpreter + Audio Processing)
echo.
echo Health Checks:
echo   Backend/Frontend: http://localhost:3000/api/health
echo   ML Sidecar:       http://localhost:8000/health
echo.
echo Services are running in separate windows. Check each window for logs.
echo To stop the app:
echo   - Close the "NeuroSync Server" window (or Ctrl+C)
echo   - Close the "NeuroSync ML Sidecar" window (or Ctrl+C)
echo.
echo ════════════════════════════════════════════════════════════════════════
echo.
pause

:: If user closes this window, kill all services
taskkill /fi "WindowTitle eq NeuroSync Server*" /f >nul 2>&1
taskkill /fi "WindowTitle eq NeuroSync ML Sidecar*" /f >nul 2>&1

echo.
echo [STOP] All NeuroSync services have been terminated.
echo.
pause
