# Pondera HR - 1C ZUP (172.20.250.32) Otomatik Rapor Senkronizasyon Betigi
$WatchFolder = "C:\1C_ZUP_Auto"
$StateFile   = "C:\1C_ZUP_Auto\last_uploaded.txt"
$ScriptPath  = "C:\1C_ZUP_Auto\sync_to_pondera.ps1"
$ApiUrl      = "https://hr.pondera.network/api/zup"

if (!(Test-Path $WatchFolder)) {
    New-Item -ItemType Directory -Path $WatchFolder -Force | Out-Null
}

$WorkerScript = @'
$WatchFolder = "C:\1C_ZUP_Auto"
$StateFile   = "C:\1C_ZUP_Auto\last_uploaded.txt"
$ApiUrl      = "https://hr.pondera.network/api/zup"

$latest = Get-ChildItem -Path $WatchFolder -Filter "*.xlsx" -File -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -notlike "~$*" } |
          Sort-Object LastWriteTime -Descending |
          Select-Object -First 1

if ($null -eq $latest) {
    Write-Host "C:\1C_ZUP_Auto klasorunde henuz .xlsx dosyasi yok." -ForegroundColor Yellow
    exit 0
}

$signature = "$($latest.Name)_$($latest.LastWriteTimeUtc.Ticks)_$($latest.Length)"
$lastSig = if (Test-Path $StateFile) { (Get-Content $StateFile -Raw).Trim() } else { "" }

if ($signature -eq $lastSig) {
    Write-Host "Son dosya ($($latest.Name)) zaten hr.pondera.network sistemine yuklenmis." -ForegroundColor Cyan
    exit 0
}

Write-Host "1C ZUP raporu yukleniyor: $($latest.FullName) -> $ApiUrl ..." -ForegroundColor Green
$resp = & curl.exe -s -X POST $ApiUrl -F "file=@$($latest.FullName)"
if ($LASTEXITCODE -eq 0 -and $resp -match '"uploadedCount"') {
    Set-Content -Path $StateFile -Value $signature -Encoding UTF8
    Write-Host "BASARILI: 1C ZUP raporu hr.pondera.network sistemine aktarildi!" -ForegroundColor Green
} else {
    Write-Host "Yukleme yaniti: $resp" -ForegroundColor Red
}
'@

Set-Content -Path $ScriptPath -Value $WorkerScript -Encoding UTF8

# Zamanlanmis Gorev Kaydi (Her 10 dakikada bir C:\1C_ZUP_Auto klasorunu kontrol eder)
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName "Pondera_1C_ZUP_AutoSync" -Action $Action -Trigger $Trigger -Description "1C ZUP raporlarini C:\1C_ZUP_Auto klasorunden hr.pondera.network sistemine otomatik aktarir" -Force | Out-Null

Write-Host "=================================================================" -ForegroundColor Green
Write-Host " KURULUM TAMAMLANDI!" -ForegroundColor Green
Write-Host " Klasor: C:\1C_ZUP_Auto" -ForegroundColor Cyan
Write-Host " Gorev : Pondera_1C_ZUP_AutoSync (Her 10 dk otomatik kontrol)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Green

# Hemen ilk kontrolu calistir
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath
