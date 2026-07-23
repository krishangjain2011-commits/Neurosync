@echo off
:: NeuroSync — One-click startup script (Windows)
:: Starts the Python ML sidecar, handwriting analyzer, and the Node.js app together.
:: Usage: double-click start.bat OR run from terminal

cd /d "%~dp0"
title NeuroSync

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

:: ── Verify node_modules ───────────────────────────────────────────────────
if not exist "node_modules" (
    echo [SETUP] Installing Node dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

:: ── Verify Python venv ────────────────────────────────────────────────────
if not exist "ml\.venv\Scripts\uvicorn.exe" (
    echo [SETUP] Python venv not found. Setting up ML sidecar...
    echo This may take a few minutes on first run.
    call npm run ml:setup
    if errorlevel 1 (
        echo [ERROR] ML sidecar setup failed.
        echo The app will still work without it using the JS fallback embedder.
    )
)

:: ── Start ML sidecar in a new window ─────────────────────────────────────
echo [START] Launching Python ML sidecar on port 8000...
start "NeuroSync ML Sidecar" /min cmd /c "cd /d ""%~dp0"" && ml\.venv\Scripts\uvicorn.exe main:app --app-dir ml --host 0.0.0.0 --port 8000 2>&1"

:: ── Start handwriting analyzer service in a new window ───────────────────
echo [START] Launching handwriting interpreter on port 8001...
start "NeuroSync Handwriting Service" /min cmd /c "cd /d ""%~dp0handwriting-service"" && ..\ml\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001"

:: Wait a moment for sidecars to boot
timeout /t 3 /nobreak >nul

:: ── Start Node server ─────────────────────────────────────────────────────
echo [START] Launching NeuroSync app on http://localhost:3000
echo.
echo  App:    http://localhost:3000
echo  ML API: http://localhost:8000/health
echo  Handwriting: http://localhost:8001/api/v1/health
echo.
echo Press Ctrl+C to stop the app.
echo.
call npx tsx server.ts

:: If tsx exits, kill the sidecar windows too
taskkill /fi "WindowTitle eq NeuroSync ML Sidecar*" /f >nul 2>&1
taskkill /fi "WindowTitle eq NeuroSync Handwriting Service*" /f >nul 2>&1
