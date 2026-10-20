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
echo Pencereyi acik birakin. Uyku modu (Sleep Mode) otomatik kapatiliyor...
echo.
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change standby-timeout-dc 0 >nul 2>&1
powercfg /change monitor-timeout-ac 0 >nul 2>&1
powercfg /change monitor-timeout-dc 0 >nul 2>&1
powercfg /change hibernate-timeout-ac 0 >nul 2>&1
powercfg /change hibernate-timeout-dc 0 >nul 2>&1

python "%~dp0rpa_bridge_server.py"

pause
