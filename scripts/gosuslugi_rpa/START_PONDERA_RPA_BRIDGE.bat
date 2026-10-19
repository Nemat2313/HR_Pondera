@echo off
chcp 65001 >nul
title Pondera HR - Gosuslugi RPA Bridge Agent (Port 8088)
echo ========================================================
echo    PONDERA HR - GOSUSLUGI VKS RPA BRIDGE (Port 8088)
echo ========================================================
echo.
echo Bu sunucu Pondera HR web sayfasindaki Gosuslugi VKS otomasyonunun
echo bilgisayarinizdaki Chrome ve Playwright robotu ile iletisim kurmasini saglar.
echo.
echo Pencereyi acik birakin.
echo.

python "%~dp0rpa_bridge_server.py"

pause
