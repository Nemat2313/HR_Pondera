@echo off
chcp 65001 >nul
title Pondera HR - Gosuslugi VKS Robot
echo ========================================================
echo    PONDERA HR - GOSUSLUGI VKS SALARY NOTIFICATION BOT
echo ========================================================
echo.
python "%~dp0gosuslugi_vks_robot.py"
pause
