@echo off
title Quorum / Rakazo Launcher
echo ========================================================
echo           Starting Quorum / Rakazo System
echo ========================================================

echo.
echo [1/3] Starting Docker containers...
docker compose --env-file .env -f infra/compose/docker-compose.images.yml -p rakazo up -d
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker failed to start! Make sure Docker Desktop is running.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/3] Opening browser at http://localhost:5173/app ...
start http://localhost:5173/app

echo.
echo [3/3] Starting Host Proxy (Antigravity AI & Local File Browser)...
echo [INFO] Press Ctrl+C in this window to stop the host proxy.
node tools/agy-proxy/src/index.js
