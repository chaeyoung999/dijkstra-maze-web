@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Dijkstra Maze TODO Quest - Local Server
cd /d "%~dp0"

echo ============================================================
echo  Dijkstra Maze TODO Quest - Local Server Launcher
echo ============================================================
echo.
echo This starts a local web server in this folder (in its own
echo window) and opens http://localhost:8000 in your browser.
echo.
echo Keep the OTHER window (titled "Dijkstra Maze Server") open
echo while you work - closing it stops the server.
echo.

set "PORT=8000"

where python >nul 2>nul
if %errorlevel%==0 (
    set "PYCMD=python"
    goto :found
)

where py >nul 2>nul
if %errorlevel%==0 (
    set "PYCMD=py"
    goto :found
)

echo [ERROR] Could not find Python on this computer.
echo.
echo Please install Python from https://www.python.org/downloads/
echo (during install, check "Add python.exe to PATH"), then run
echo this file again.
echo.
pause
exit /b 1

:found
echo Using: %PYCMD%
echo Starting server on port %PORT% ...
echo.

start "Dijkstra Maze Server (do not close)" cmd /k %PYCMD% -m http.server %PORT%

echo Waiting for the server to come up...
ping -n 3 127.0.0.1 >nul

start "" "http://localhost:%PORT%/index.html"

echo.
echo The server is running in the OTHER window titled
echo "Dijkstra Maze Server (do not close)". Keep that window
echo open while you work; close it when you are done.
echo.
echo You can close THIS window now.
pause
