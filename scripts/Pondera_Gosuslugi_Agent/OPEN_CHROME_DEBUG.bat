@echo off
chcp 65001 >nul
title Pondera HR - Open Chrome for Gosuslugi RPA
echo ========================================================
echo  Pondera HR - Chrome Remote Debugging Modu Aciliyor
echo ========================================================
echo.
echo Bu pencere Chrome'u port 9222 ile acar.
echo 1. Acilan Chrome'da Gosuslugi'ye girin ve giris yapin (Giris/Rutoken/SMS).
echo 2. Ardindan Pondera HR ekranindan VKS Gonderimini baslatin!
echo.

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

start "" %CHROME_PATH% --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data RPA" --no-first-run --no-default-browser-check --start-maximized "https://www.gosuslugi.ru/600585/1/form"
