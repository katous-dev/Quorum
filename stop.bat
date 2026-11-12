@echo off
title Quorum / Rakazo Stop
echo Stopping Quorum / Rakazo containers...
docker compose --env-file .env -f infra/compose/docker-compose.images.yml -p rakazo stop
echo All containers stopped.
pause
