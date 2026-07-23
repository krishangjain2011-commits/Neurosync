@echo off
cd /d "%~dp0"
set PYTHONPATH=%~dp0
..\ml\.venv\Scripts\python.exe -m pip install -q -r requirements.txt
..\ml\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001
