@echo off
chcp 65001 >nul
title DRAGON // duas telas
cd /d "%~dp0"
echo.
echo  Iniciando o servidor local...
echo.
start "" http://localhost:5173
node server.js 5173
pause
