@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 22 or later on the teacher PC, then run this file again.
  echo https://nodejs.org/
  pause
  exit /b 1
)
node server.mjs
pause
