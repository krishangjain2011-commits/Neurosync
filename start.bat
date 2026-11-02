@echo off
echo Starting NeuroSync...

REM Install dependencies if needed
if not exist node_modules (
  echo Installing root dependencies...
  call npm install --legacy-peer-deps
)

if not exist diagnostic-engine\node_modules (
  echo Installing diagnostic-engine dependencies...
  cd diagnostic-engine
  call npm install
  cd ..
)

if not exist .venv (
  echo Creating Python virtual environment...
  py -m venv .venv
  call .venv\Scripts\pip install -r ml\requirements.txt
)

REM Start the application with concurrently
echo Launching services...
call npm run dev:full

pause
