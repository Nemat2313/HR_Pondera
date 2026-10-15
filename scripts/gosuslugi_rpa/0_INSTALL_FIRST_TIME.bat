@echo off
chcp 65001 >nul
title Pondera HR - Установка компонентов RPA (İlk Kurulum)
echo ========================================================
echo   Установка компонентов Pondera HR Gosuslugi RPA...
echo   Pondera HR Gosuslugi RPA bilesenleri kuruluyor...
echo ========================================================
echo.
python -m pip install playwright openpyxl
python -m playwright install chromium
echo.
echo ========================================================
echo   ГОТОВО! Теперь запустите START_PONDERA_RPA_BRIDGE.bat
echo   TAMAMLANDI! Simdi START_PONDERA_RPA_BRIDGE.bat calistirin.
echo ========================================================
pause
