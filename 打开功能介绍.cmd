@echo off
chcp 65001 >nul
if not exist "%~dp0native\bin\node.exe" (
  start "" "%~dp0功能介绍.html"
  exit /b
)
"%~dp0native\bin\node.exe" "%~dp0tools\showcase-server.cjs" --open
pause
