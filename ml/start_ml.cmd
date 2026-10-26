@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."
call ml\.venv\Scripts\activate.bat
python -m uvicorn main:app --app-dir ml --host 0.0.0.0 --port 8000
